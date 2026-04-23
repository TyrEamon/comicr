package com.tyr.comicsapp;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "Archive")
public class ArchivePlugin extends Plugin {
    private static final int MAX_IMAGES_PER_ARCHIVE = 5000;
    private final ExecutorService archiveExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void pickArchive(PluginCall call) {
        openArchivePicker(call, false, "pickArchiveResult");
    }

    @PluginMethod
    public void pickArchives(PluginCall call) {
        openArchivePicker(call, true, "pickArchivesResult");
    }

    private void openArchivePicker(PluginCall call, boolean allowMultiple, String callbackName) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple);
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
            "application/zip",
            "application/x-zip-compressed",
            "application/vnd.comicbook+zip",
            "application/octet-stream"
        });
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, callbackName);
    }

    @PluginMethod
    public void readEntry(PluginCall call) {
        String uriValue = call.getString("uri");
        String entryName = call.getString("entryName");
        if (uriValue == null || uriValue.isEmpty() || entryName == null || entryName.isEmpty()) {
            call.reject("缺少压缩包页面参数");
            return;
        }

        Uri archiveUri = Uri.parse(uriValue);
        archiveExecutor.execute(() -> {
            try {
                JSObject response = readEntryPayload(archiveUri, entryName);
                resolveOnMain(call, response);
            } catch (Exception error) {
                rejectOnMain(call, error.getMessage() == null ? "读取压缩包页面失败" : error.getMessage());
            }
        });
    }

    @ActivityCallback
    private void pickArchiveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("未选择压缩包");
            return;
        }

        List<Uri> archiveUris = selectedArchiveUris(result.getData());
        if (archiveUris.isEmpty()) {
            call.reject("无法读取压缩包授权");
            return;
        }

        Uri archiveUri = archiveUris.get(0);
        persistReadPermission(archiveUri, result.getData().getFlags());

        archiveExecutor.execute(() -> {
            try {
                resolveOnMain(call, buildArchiveResponse(archiveUri));
            } catch (Exception error) {
                rejectOnMain(call, error.getMessage() == null ? "扫描压缩包失败" : error.getMessage());
            }
        });
    }

    @ActivityCallback
    private void pickArchivesResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("未选择压缩包");
            return;
        }

        Intent data = result.getData();
        List<Uri> archiveUris = selectedArchiveUris(data);
        if (archiveUris.isEmpty()) {
            call.reject("无法读取压缩包授权");
            return;
        }

        int flags = data.getFlags();
        for (Uri archiveUri : archiveUris) {
            persistReadPermission(archiveUri, flags);
        }

        archiveExecutor.execute(() -> {
            JSArray archiveItems = new JSArray();
            JSArray errorItems = new JSArray();
            String firstErrorMessage = null;

            for (Uri archiveUri : archiveUris) {
                try {
                    archiveItems.put(buildArchiveResponse(archiveUri));
                } catch (Exception error) {
                    String errorMessage = error.getMessage() == null ? "扫描压缩包失败" : error.getMessage();
                    if (firstErrorMessage == null) firstErrorMessage = errorMessage;
                    JSObject item = new JSObject();
                    item.put("title", cleanArchiveTitle(queryDisplayName(archiveUri, "压缩包漫画")));
                    item.put("message", errorMessage);
                    errorItems.put(item);
                }
            }

            if (archiveItems.length() == 0) {
                rejectOnMain(call, firstErrorMessage == null ? "选择的压缩包里没有可阅读的图片" : firstErrorMessage);
                return;
            }

            JSObject response = new JSObject();
            response.put("archives", archiveItems);
            response.put("errors", errorItems);
            resolveOnMain(call, response);
        });
    }

    private JSObject buildArchiveResponse(Uri archiveUri) throws Exception {
        ArchiveScanResult scan = scanArchive(archiveUri);
        List<ArchivePage> pages = scan.pages;
        if (pages.isEmpty()) {
            throw new Exception("压缩包里没有可阅读的图片");
        }

        JSArray pageItems = new JSArray();
        for (ArchivePage page : pages) {
            JSObject item = new JSObject();
            item.put("name", page.displayName);
            item.put("type", page.type);
            item.put("archiveUri", archiveUri.toString());
            item.put("entryName", page.entryName);
            pageItems.put(item);
        }

        String fileName = queryDisplayName(archiveUri, "压缩包漫画");
        JSObject response = new JSObject();
        response.put("title", cleanArchiveTitle(fileName));
        response.put("archiveUri", archiveUri.toString());
        response.put("imageCount", pages.size());
        response.put("partial", scan.partial);
        if (scan.partial) {
            response.put("warning", "压缩包可能没有下载完整，已只索引可读取的页面。");
        }
        response.put("pages", pageItems);
        return response;
    }

    private List<Uri> selectedArchiveUris(Intent data) {
        List<Uri> uris = new ArrayList<>();
        ClipData clipData = data.getClipData();
        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index++) {
                Uri uri = clipData.getItemAt(index).getUri();
                if (uri != null) uris.add(uri);
            }
        }

        Uri dataUri = data.getData();
        if (dataUri != null && !uris.contains(dataUri)) {
            uris.add(dataUri);
        }

        return uris;
    }

    private void persistReadPermission(Uri uri, int rawFlags) {
        int flags = rawFlags
            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if ((flags & Intent.FLAG_GRANT_READ_URI_PERMISSION) == 0) return;

        try {
            getContext().getContentResolver().takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            );
        } catch (SecurityException | IllegalArgumentException ignored) {
            // Some file pickers grant temporary access only. Reading now can still work.
        }
    }

    private ArchiveScanResult scanArchive(Uri archiveUri) throws Exception {
        List<ArchivePage> pages = new ArrayList<>();
        InputStream input = getContext().getContentResolver().openInputStream(archiveUri);
        if (input == null) throw new Exception("无法读取压缩包");
        boolean partial = false;

        try (InputStream archiveInput = input;
             ZipInputStream zip = new ZipInputStream(archiveInput)) {
            while (pages.size() < MAX_IMAGES_PER_ARCHIVE) {
                ZipEntry entry;
                try {
                    entry = zip.getNextEntry();
                } catch (Exception error) {
                    if (pages.isEmpty()) throw error;
                    partial = true;
                    break;
                }

                if (entry == null) break;

                ArchivePage page = null;
                if (pages.size() >= MAX_IMAGES_PER_ARCHIVE) break;
                if (!entry.isDirectory() && isImageName(entry.getName())) {
                    page = new ArchivePage(
                        entry.getName(),
                        displayName(entry.getName()),
                        mimeType(entry.getName())
                    );
                    pages.add(page);
                }

                try {
                    zip.closeEntry();
                } catch (Exception error) {
                    if (page != null) pages.remove(page);
                    if (pages.isEmpty()) throw error;
                    partial = true;
                    break;
                }
            }
        } catch (Exception error) {
            if (pages.isEmpty()) throw error;
            partial = true;
        }

        pages.sort(Comparator.comparing(page -> page.entryName, this::naturalCompare));
        return new ArchiveScanResult(pages, partial);
    }

    private JSObject readEntryPayload(Uri archiveUri, String expectedEntryName) throws Exception {
        try {
            return readEntryPayloadRandomAccess(archiveUri, expectedEntryName);
        } catch (Exception ignored) {
            return readEntryPayloadSequential(archiveUri, expectedEntryName);
        }
    }

    private JSObject readEntryPayloadRandomAccess(Uri archiveUri, String expectedEntryName) throws Exception {
        ParcelFileDescriptor descriptor = getContext().getContentResolver().openFileDescriptor(archiveUri, "r");
        if (descriptor == null) throw new Exception("无法随机读取压缩包");

        try (ParcelFileDescriptor closeableDescriptor = descriptor;
             ZipFile zipFile = new ZipFile("/proc/self/fd/" + closeableDescriptor.getFd())) {
            ZipEntry entry = zipFile.getEntry(expectedEntryName);
            if (entry == null || entry.isDirectory()) {
                throw new Exception("压缩包里找不到该页面");
            }

            try (InputStream input = zipFile.getInputStream(entry)) {
                return buildEntryResponse(entry.getName(), input);
            }
        }
    }

    private JSObject readEntryPayloadSequential(Uri archiveUri, String expectedEntryName) throws Exception {
        InputStream input = getContext().getContentResolver().openInputStream(archiveUri);
        if (input == null) throw new Exception("无法读取压缩包");

        try (InputStream archiveInput = input;
             ZipInputStream zip = new ZipInputStream(archiveInput)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!entry.isDirectory() && expectedEntryName.equals(entry.getName())) {
                    return buildEntryResponse(entry.getName(), zip);
                }
                zip.closeEntry();
            }
        }

        throw new Exception("压缩包里找不到该页面");
    }

    private JSObject buildEntryResponse(String entryName, InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[32 * 1024];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }

        JSObject response = new JSObject();
        response.put("type", mimeType(entryName));
        response.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
        return response;
    }

    private boolean isImageName(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".jpg")
            || lower.endsWith(".jpeg")
            || lower.endsWith(".png")
            || lower.endsWith(".webp")
            || lower.endsWith(".gif")
            || lower.endsWith(".bmp")
            || lower.endsWith(".avif");
    }

    private String mimeType(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".bmp")) return "image/bmp";
        if (lower.endsWith(".avif")) return "image/avif";
        return "image/jpeg";
    }

    private String displayName(String entryName) {
        int slashIndex = entryName.lastIndexOf('/');
        return slashIndex >= 0 ? entryName.substring(slashIndex + 1) : entryName;
    }

    private String cleanArchiveTitle(String name) {
        String safeName = name == null || name.isEmpty() ? "压缩包漫画" : name;
        String title = safeName.replaceAll("(?i)\\.(zip|cbz)$", "").trim();
        return title.isEmpty() ? "压缩包漫画" : title;
    }

    private String queryDisplayName(Uri uri, String fallback) {
        try (android.database.Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String value = cursor.getString(index);
                    if (value != null && !value.isEmpty()) return value;
                }
            }
        }
        return fallback;
    }

    private int naturalCompare(String left, String right) {
        int leftIndex = 0;
        int rightIndex = 0;

        while (leftIndex < left.length() && rightIndex < right.length()) {
            char leftChar = left.charAt(leftIndex);
            char rightChar = right.charAt(rightIndex);

            if (Character.isDigit(leftChar) && Character.isDigit(rightChar)) {
                int leftStart = leftIndex;
                int rightStart = rightIndex;
                while (leftIndex < left.length() && Character.isDigit(left.charAt(leftIndex))) leftIndex++;
                while (rightIndex < right.length() && Character.isDigit(right.charAt(rightIndex))) rightIndex++;

                String leftNumber = trimLeadingZeroes(left.substring(leftStart, leftIndex));
                String rightNumber = trimLeadingZeroes(right.substring(rightStart, rightIndex));
                if (leftNumber.length() != rightNumber.length()) {
                    return leftNumber.length() - rightNumber.length();
                }
                int numberCompare = leftNumber.compareTo(rightNumber);
                if (numberCompare != 0) return numberCompare;
                continue;
            }

            int charCompare = String.valueOf(leftChar).compareToIgnoreCase(String.valueOf(rightChar));
            if (charCompare != 0) return charCompare;
            leftIndex++;
            rightIndex++;
        }

        return left.length() - right.length();
    }

    private String trimLeadingZeroes(String value) {
        String trimmed = value.replaceFirst("^0+", "");
        return trimmed.isEmpty() ? "0" : trimmed;
    }

    private void resolveOnMain(PluginCall call, JSObject response) {
        getActivity().runOnUiThread(() -> call.resolve(response));
    }

    private void rejectOnMain(PluginCall call, String message) {
        getActivity().runOnUiThread(() -> call.reject(message));
    }

    private static class ArchivePage {
        final String entryName;
        final String displayName;
        final String type;

        ArchivePage(String entryName, String displayName, String type) {
            this.entryName = entryName;
            this.displayName = displayName;
            this.type = type;
        }
    }

    private static class ArchiveScanResult {
        final List<ArchivePage> pages;
        final boolean partial;

        ArchiveScanResult(List<ArchivePage> pages, boolean partial) {
            this.pages = pages;
            this.partial = partial;
        }
    }
}
