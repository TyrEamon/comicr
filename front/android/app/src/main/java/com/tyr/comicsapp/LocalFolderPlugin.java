package com.tyr.comicsapp;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

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
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalFolder")
public class LocalFolderPlugin extends Plugin {
    private static final int MAX_MANGAS = 300;
    private static final int MAX_IMAGES_PER_MANGA = 3000;
    private static final List<String> CONTENT_DIRECTORY_NAMES = Arrays.asList(
        "page", "pages", "image", "images", "img", "imgs", "raw", "scan", "scans", "original", "origin"
    );

    private final ExecutorService scannerExecutor = Executors.newSingleThreadExecutor();
    private final Map<String, ScannedManga> scanCache = new ConcurrentHashMap<>();

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @PluginMethod
    public void loadMangaImages(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("缺少漫画索引");
            return;
        }

        ScannedManga manga = scanCache.get(id);
        if (manga == null) {
            call.reject("漫画索引已失效，请重新选择文件夹");
            return;
        }

        scannerExecutor.execute(() -> {
            try {
                JSArray items = new JSArray();
                for (PageFile page : manga.pages) {
                    JSObject item = new JSObject();
                    item.put("name", page.displayName);
                    item.put("type", mimeType(page.file));
                    item.put("base64", readBase64(page.file.getUri()));
                    items.put(item);
                }

                JSObject response = new JSObject();
                response.put("title", manga.title);
                response.put("images", items);
                resolveOnMain(call, response);
            } catch (Exception error) {
                rejectOnMain(call, error.getMessage() == null ? "读取漫画图片失败" : error.getMessage());
            }
        });
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("未选择文件夹");
            return;
        }

        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("无法读取文件夹授权");
            return;
        }

        int flags = result.getData().getFlags()
            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if ((flags & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0) {
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        }

        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        if (root == null || !root.isDirectory()) {
            call.reject("选择的不是文件夹");
            return;
        }

        scannerExecutor.execute(() -> {
            try {
                List<ScannedManga> mangas = scanRoot(root, treeUri);
                if (mangas.isEmpty()) {
                    rejectOnMain(call, "文件夹里没有识别到漫画图片目录");
                    return;
                }

                scanCache.clear();
                JSArray mangaItems = new JSArray();
                for (ScannedManga manga : mangas) {
                    scanCache.put(manga.id, manga);

                    JSObject item = new JSObject();
                    item.put("id", manga.id);
                    item.put("title", manga.title);
                    item.put("imageCount", manga.pages.size());
                    item.put("structureType", manga.structureType);
                    mangaItems.put(item);
                }

                JSObject response = new JSObject();
                response.put("rootTitle", safeName(root, "漫画库"));
                response.put("mangas", mangaItems);
                resolveOnMain(call, response);
            } catch (Exception error) {
                rejectOnMain(call, error.getMessage() == null ? "文件夹扫描失败" : error.getMessage());
            }
        });
    }

    private List<ScannedManga> scanRoot(DocumentFile root, Uri treeUri) {
        DirectorySnapshot rootSnapshot = snapshot(root);
        String parentTitle = parentTitleFromTreeUri(treeUri);
        List<ScannedManga> mangas = new ArrayList<>();

        if (shouldTreatSelectionAsSingleManga(rootSnapshot)) {
            ScannedManga manga = buildManga(rootSnapshot, parentTitle, true);
            if (manga != null) mangas.add(manga);
            return mangas;
        }

        List<DocumentFile> childDirs = sortedFiles(rootSnapshot.childDirs);
        for (DocumentFile child : childDirs) {
            if (mangas.size() >= MAX_MANGAS) break;

            ScannedManga manga = buildManga(snapshot(child), null, false);
            if (manga != null) mangas.add(manga);
        }

        return mangas;
    }

    private boolean shouldTreatSelectionAsSingleManga(DirectorySnapshot root) {
        if (!root.imageFiles.isEmpty()) return true;

        List<DirectorySnapshot> imageChildren = imageChildSnapshots(root);
        if (imageChildren.isEmpty()) return false;
        if (imageChildren.size() == 1) {
            String childName = imageChildren.get(0).name;
            return !isLibraryDirectoryName(root.name)
                || isContentDirectoryName(childName)
                || isChapterDirectoryName(childName);
        }

        for (DirectorySnapshot child : imageChildren) {
            if (!isContentDirectoryName(child.name) && !isChapterDirectoryName(child.name)) {
                return false;
            }
        }
        return true;
    }

    private ScannedManga buildManga(DirectorySnapshot mangaDir, String selectedParentTitle, boolean allowSelectedParentTitle) {
        List<PageFile> pages = new ArrayList<>();
        String structureType = "single";

        if (!mangaDir.imageFiles.isEmpty()) {
            appendPages(pages, "", mangaDir.imageFiles);
        } else {
            List<DirectorySnapshot> imageChildren = imageChildSnapshots(mangaDir);
            if (imageChildren.isEmpty()) return null;

            structureType = imageChildren.size() > 1 ? "chapters" : "nested";
            imageChildren.sort((left, right) -> naturalCompare(left.name, right.name));
            for (DirectorySnapshot child : imageChildren) {
                appendPages(pages, child.name, child.imageFiles);
                if (pages.size() >= MAX_IMAGES_PER_MANGA) break;
            }
        }

        if (pages.isEmpty()) return null;

        String title = mangaDir.name;
        if (allowSelectedParentTitle && selectedParentTitle != null && isContentDirectoryName(title)) {
            title = selectedParentTitle;
        }

        return new ScannedManga(
            UUID.randomUUID().toString(),
            title == null || title.isEmpty() ? "文件夹导入" : title,
            structureType,
            pages
        );
    }

    private DirectorySnapshot snapshot(DocumentFile folder) {
        List<DocumentFile> imageFiles = new ArrayList<>();
        List<DocumentFile> childDirs = new ArrayList<>();

        for (DocumentFile file : folder.listFiles()) {
            if (file.isDirectory()) {
                childDirs.add(file);
            } else if (isImage(file)) {
                imageFiles.add(file);
            }
        }

        imageFiles = sortedFiles(imageFiles);
        childDirs = sortedFiles(childDirs);
        return new DirectorySnapshot(safeName(folder, "未命名目录"), imageFiles, childDirs);
    }

    private List<DirectorySnapshot> imageChildSnapshots(DirectorySnapshot folder) {
        List<DirectorySnapshot> children = new ArrayList<>();
        for (DocumentFile childDir : folder.childDirs) {
            DirectorySnapshot child = snapshot(childDir);
            if (!child.imageFiles.isEmpty()) {
                children.add(child);
            }
        }
        return children;
    }

    private void appendPages(List<PageFile> pages, String sectionName, List<DocumentFile> imageFiles) {
        List<DocumentFile> sortedImages = sortedFiles(imageFiles);
        for (DocumentFile image : sortedImages) {
            if (pages.size() >= MAX_IMAGES_PER_MANGA) return;

            String imageName = safeName(image, "image");
            String displayName = sectionName == null || sectionName.isEmpty()
                ? imageName
                : sectionName + "/" + imageName;
            pages.add(new PageFile(image, displayName));
        }
    }

    private boolean isImage(DocumentFile file) {
        String type = file.getType();
        if (type != null && type.startsWith("image/")) return true;

        String name = file.getName();
        if (name == null) return false;

        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".jpg")
            || lower.endsWith(".jpeg")
            || lower.endsWith(".png")
            || lower.endsWith(".webp")
            || lower.endsWith(".avif");
    }

    private boolean isContentDirectoryName(String name) {
        if (name == null) return false;

        String lower = name.trim().toLowerCase(Locale.ROOT);
        String compact = lower.replaceAll("[\\s_\\-.]+", "");
        if (compact.matches("\\d{2,}")) return true;
        if (CONTENT_DIRECTORY_NAMES.contains(compact)) return true;

        return lower.matches("^(chapter|chap|ch|vol|volume)\\s*\\d+.*$")
            || isChapterDirectoryName(lower);
    }

    private boolean isChapterDirectoryName(String name) {
        if (name == null) return false;
        String lower = name.trim().toLowerCase(Locale.ROOT);
        return lower.matches("^第\\s*\\d+\\s*[话話章卷].*$")
            || lower.matches("^(chapter|chap|ch)\\s*\\d+.*$")
            || lower.matches("^(vol|volume)\\s*\\d+.*$");
    }

    private boolean isLibraryDirectoryName(String name) {
        if (name == null) return false;
        String lower = name.trim().toLowerCase(Locale.ROOT);
        return lower.contains("漫画库")
            || lower.contains("漫画本子")
            || lower.contains("本子")
            || lower.contains("library")
            || lower.contains("books")
            || lower.contains("comics")
            || lower.contains("manga");
    }

    private List<DocumentFile> sortedFiles(List<DocumentFile> files) {
        List<DocumentFile> copy = new ArrayList<>(files);
        copy.sort(Comparator.comparing(file -> safeName(file, ""), this::naturalCompare));
        return copy;
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

            int charCompare = String.valueOf(leftChar)
                .compareToIgnoreCase(String.valueOf(rightChar));
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

    private String mimeType(DocumentFile file) {
        String type = file.getType();
        if (type != null && !type.isEmpty()) return type;

        String lower = safeName(file, "").toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".avif")) return "image/avif";
        return "image/jpeg";
    }

    private String safeName(DocumentFile file, String fallback) {
        String name = file.getName();
        return name == null || name.isEmpty() ? queryDisplayName(file.getUri(), fallback) : name;
    }

    private String queryDisplayName(Uri uri, String fallback) {
        try (android.database.Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        }
        return fallback;
    }

    private String parentTitleFromTreeUri(Uri treeUri) {
        List<String> segments = pathSegmentsFromTreeUri(treeUri);
        if (segments.size() < 2) return null;
        return segments.get(segments.size() - 2);
    }

    private List<String> pathSegmentsFromTreeUri(Uri treeUri) {
        try {
            String documentId = DocumentsContract.getTreeDocumentId(treeUri);
            int colonIndex = documentId.indexOf(':');
            String path = colonIndex >= 0 ? documentId.substring(colonIndex + 1) : documentId;
            if (path == null || path.isEmpty()) return new ArrayList<>();

            List<String> segments = new ArrayList<>();
            for (String segment : path.split("/")) {
                if (!segment.isEmpty()) segments.add(Uri.decode(segment));
            }
            return segments;
        } catch (Exception ignored) {
            return new ArrayList<>();
        }
    }

    private String readBase64(Uri uri) throws Exception {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new Exception("无法读取图片");
            byte[] buffer = new byte[32 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        }
    }

    private void resolveOnMain(PluginCall call, JSObject response) {
        getActivity().runOnUiThread(() -> call.resolve(response));
    }

    private void rejectOnMain(PluginCall call, String message) {
        getActivity().runOnUiThread(() -> call.reject(message));
    }

    private static class DirectorySnapshot {
        final String name;
        final List<DocumentFile> imageFiles;
        final List<DocumentFile> childDirs;

        DirectorySnapshot(String name, List<DocumentFile> imageFiles, List<DocumentFile> childDirs) {
            this.name = name;
            this.imageFiles = imageFiles;
            this.childDirs = childDirs;
        }
    }

    private static class ScannedManga {
        final String id;
        final String title;
        final String structureType;
        final List<PageFile> pages;

        ScannedManga(String id, String title, String structureType, List<PageFile> pages) {
            this.id = id;
            this.title = title;
            this.structureType = structureType;
            this.pages = pages;
        }
    }

    private static class PageFile {
        final DocumentFile file;
        final String displayName;

        PageFile(DocumentFile file, String displayName) {
            this.file = file;
            this.displayName = displayName;
        }
    }
}
