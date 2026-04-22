package com.tyr.comicsapp;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
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

import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(name = "LocalFolder")
public class LocalFolderPlugin extends Plugin {
    private static final int MAX_IMAGES = 1200;

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "pickFolderResult");
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
        getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);

        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        if (root == null || !root.isDirectory()) {
            call.reject("选择的不是文件夹");
            return;
        }

        try {
            List<DocumentFile> images = new ArrayList<>();
            collectImages(root, images);
            images.sort(Comparator.comparing(this::displayPath, String.CASE_INSENSITIVE_ORDER));

            if (images.isEmpty()) {
                call.reject("文件夹里没有可导入的图片");
                return;
            }

            JSArray items = new JSArray();
            for (DocumentFile image : images) {
                JSObject item = new JSObject();
                String name = displayPath(image);
                item.put("name", name);
                item.put("type", mimeType(image));
                item.put("base64", readBase64(image.getUri()));
                items.put(item);
            }

            JSObject response = new JSObject();
            response.put("title", root.getName() == null ? "文件夹导入" : root.getName());
            response.put("images", items);
            call.resolve(response);
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "文件夹导入失败" : error.getMessage());
        }
    }

    private void collectImages(DocumentFile folder, List<DocumentFile> images) {
        if (images.size() >= MAX_IMAGES) return;
        for (DocumentFile file : folder.listFiles()) {
            if (images.size() >= MAX_IMAGES) return;
            if (file.isDirectory()) {
                collectImages(file, images);
            } else if (isImage(file)) {
                images.add(file);
            }
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
            || lower.endsWith(".gif")
            || lower.endsWith(".bmp")
            || lower.endsWith(".avif");
    }

    private String mimeType(DocumentFile file) {
        String type = file.getType();
        return type == null || type.isEmpty() ? "image/jpeg" : type;
    }

    private String displayPath(DocumentFile file) {
        String name = file.getName();
        return name == null || name.isEmpty() ? queryDisplayName(file.getUri()) : name;
    }

    private String queryDisplayName(Uri uri) {
        try (android.database.Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        }
        return "image";
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
}
