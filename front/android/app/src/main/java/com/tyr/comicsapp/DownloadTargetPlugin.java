package com.tyr.comicsapp;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
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

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DownloadTarget")
public class DownloadTargetPlugin extends Plugin {
    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @PluginMethod
    public void writeImage(PluginCall call) {
        String title = call.getString("title");
        String name = call.getString("name");
        String type = call.getString("type", "image/jpeg");
        String base64 = call.getString("base64");
        String targetUriValue = call.getString("targetUri", "");

        if (title == null || title.trim().isEmpty() || name == null || name.trim().isEmpty() || base64 == null) {
            call.reject("缺少下载写入参数");
            return;
        }

        downloadExecutor.execute(() -> {
            try {
                JSObject response = targetUriValue == null || targetUriValue.isEmpty()
                    ? writeToDefaultFolder(title, name, type, base64)
                    : writeToTreeFolder(Uri.parse(targetUriValue), title, name, type, base64);
                resolveOnMain(call, response);
            } catch (Exception error) {
                rejectOnMain(call, error.getMessage() == null ? "写入下载文件失败" : error.getMessage());
            }
        });
    }

    @PluginMethod
    public void deleteImages(PluginCall call) {
        JSArray uriItems = call.getArray("uris");
        if (uriItems == null || uriItems.length() == 0) {
            call.reject("缺少要删除的下载文件");
            return;
        }

        downloadExecutor.execute(() -> {
            int deleted = 0;
            int failed = 0;

            for (int index = 0; index < uriItems.length(); index++) {
                String uriValue = uriItems.optString(index, "");
                if (uriValue.isEmpty()) continue;

                if (deleteUri(uriValue)) {
                    deleted++;
                } else {
                    failed++;
                }
            }

            JSObject response = new JSObject();
            response.put("deleted", deleted);
            response.put("failed", failed);
            resolveOnMain(call, response);
        });
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("未选择下载目录");
            return;
        }

        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("无法读取下载目录授权");
            return;
        }

        int flags = result.getData().getFlags()
            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if (flags != 0) {
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        }

        DocumentFile folder = DocumentFile.fromTreeUri(getContext(), treeUri);
        JSObject response = new JSObject();
        response.put("uri", treeUri.toString());
        response.put("name", folder == null ? "自定义下载目录" : safeName(folder, "自定义下载目录"));
        resolveOnMain(call, response);
    }

    private JSObject writeToTreeFolder(Uri targetUri, String title, String name, String type, String base64) throws Exception {
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), targetUri);
        if (root == null || !root.isDirectory()) {
            throw new Exception("下载目录不可用，请重新选择");
        }

        String safeTitle = sanitizeFileName(title);
        String safeImageName = sanitizeFileName(name);
        DocumentFile mangaFolder = findChildDirectory(root, safeTitle);
        if (mangaFolder == null) {
            mangaFolder = root.createDirectory(safeTitle);
        }
        if (mangaFolder == null || !mangaFolder.isDirectory()) {
            throw new Exception("无法创建漫画下载目录");
        }

        DocumentFile existing = mangaFolder.findFile(safeImageName);
        if (existing != null) existing.delete();

        DocumentFile image = mangaFolder.createFile(type, safeImageName);
        if (image == null) {
            throw new Exception("无法创建下载图片");
        }

        writeBase64ToUri(image.getUri(), base64);
        return imageResponse(image.getUri().toString(), safeImageName, type, mangaFolder.getUri().toString());
    }

    private boolean deleteUri(String uriValue) {
        try {
            Uri uri = Uri.parse(uriValue);
            String scheme = uri.getScheme();
            if ("file".equalsIgnoreCase(scheme)) {
                String path = uri.getPath();
                return path != null && new File(path).delete();
            }

            try {
                DocumentFile file = DocumentFile.fromSingleUri(getContext(), uri);
                if (file != null && file.exists()) {
                    return file.delete();
                }
            } catch (Exception ignored) {
                // Fall through to ContentResolver delete below.
            }

            return getContext().getContentResolver().delete(uri, null, null) > 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    private JSObject writeToDefaultFolder(String title, String name, String type, String base64) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return writeToPublicDownloads(title, name, type, base64);
        }

        File root = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Comicr");
        File mangaFolder = new File(root, sanitizeFileName(title));
        if (!mangaFolder.exists() && !mangaFolder.mkdirs()) {
            throw new Exception("无法创建默认下载目录");
        }

        File image = new File(mangaFolder, sanitizeFileName(name));
        try (FileOutputStream output = new FileOutputStream(image, false)) {
            output.write(Base64.decode(base64, Base64.DEFAULT));
        }

        return imageResponse(Uri.fromFile(image).toString(), name, type, Uri.fromFile(mangaFolder).toString());
    }

    private JSObject writeToPublicDownloads(String title, String name, String type, String base64) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        String relativePath = Environment.DIRECTORY_DOWNLOADS
            + File.separator
            + "Comicr"
            + File.separator
            + sanitizeFileName(title);

        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, sanitizeFileName(name));
        values.put(MediaStore.MediaColumns.MIME_TYPE, type);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new Exception("无法创建默认下载文件");

        try {
            writeBase64ToUri(uri, base64);
            ContentValues doneValues = new ContentValues();
            doneValues.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, doneValues, null, null);
        } catch (Exception error) {
            resolver.delete(uri, null, null);
            throw error;
        }

        return imageResponse(uri.toString(), name, type, "Download/Comicr/" + sanitizeFileName(title));
    }

    private void writeBase64ToUri(Uri uri, String base64) throws Exception {
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new Exception("无法写入下载图片");
            output.write(Base64.decode(base64, Base64.DEFAULT));
        }
    }

    private JSObject imageResponse(String uri, String name, String type, String folderUri) {
        JSObject response = new JSObject();
        response.put("uri", uri);
        response.put("name", name);
        response.put("type", type);
        response.put("folderUri", folderUri);
        return response;
    }

    private DocumentFile findChildDirectory(DocumentFile root, String title) {
        for (DocumentFile child : root.listFiles()) {
            if (child.isDirectory() && title.equals(safeName(child, ""))) {
                return child;
            }
        }
        return null;
    }

    private String safeName(DocumentFile file, String fallback) {
        String name = file.getName();
        if (name != null && !name.isEmpty()) return name;
        return queryDisplayName(file.getUri(), fallback);
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

    private String sanitizeFileName(String value) {
        String safeValue = value == null ? "" : value.trim();
        if (safeValue.isEmpty()) return "download";
        return safeValue.replaceAll("[\\\\/:*?\"<>|\\u0000-\\u001F]", "_");
    }

    private void resolveOnMain(PluginCall call, JSObject response) {
        getActivity().runOnUiThread(() -> call.resolve(response));
    }

    private void rejectOnMain(PluginCall call, String message) {
        getActivity().runOnUiThread(() -> call.reject(message));
    }
}
