package com.tyr.comicsapp;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.documentfile.provider.DocumentFile;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "JmComic")
public class JmComicPlugin extends Plugin {
    private static final Set<String> IMAGE_SUFFIXES = new HashSet<>(Arrays.asList(".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"));

    private final ExecutorService jmExecutor = Executors.newSingleThreadExecutor();
    private final Set<String> cancelledTasks = ConcurrentHashMap.newKeySet();

    @PluginMethod
    public void probe(PluginCall call) {
        try {
            PyObject module = python().getModule("jmcomic");
            JSObject result = new JSObject();
            result.put("available", true);
            result.put("version", String.valueOf(module.get("__version__")));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("JM runtime unavailable: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String target = call.getString("target", "").trim();
        String taskId = call.getString("taskId", UUID.randomUUID().toString());
        String targetUri = call.getString("targetUri", "");
        int threadCount = Math.max(1, Math.min(call.getInt("threadCount", 4), 8));
        JSObject proxy = call.getObject("proxy");
        final String proxyJson = proxy == null ? "{}" : proxy.toString();

        if (target.isEmpty()) {
            call.reject("缺少 JM 链接或车号");
            return;
        }

        cancelledTasks.remove(taskId);
        jmExecutor.execute(() -> {
            File tempDir = new File(getContext().getCacheDir(), "jm-downloads/" + taskId);
            try {
                deleteRecursively(tempDir);
                if (!tempDir.mkdirs() && !tempDir.isDirectory()) {
                    throw new Exception("无法创建 JM 临时目录");
                }

                ProgressBridge progress = new ProgressBridge(taskId);
                PyObject result = python()
                    .getModule("comicr_jm_bridge")
                    .callAttr("download", target, tempDir.getAbsolutePath(), threadCount, progress, proxyJson);

                if (isCancelled(taskId)) {
                    deleteRecursively(tempDir);
                    rejectOnMain(call, "下载已取消");
                    return;
                }

                String title = stringFromResult(result, "title", "JM 下载");
                List<DownloadedSource> files = filesFromResult(result);
                if (files.isEmpty()) {
                    files = sourcesFromFiles(collectImageFiles(tempDir));
                }
                if (files.isEmpty()) {
                    throw new Exception("JM 下载完成但没有找到图片");
                }

                JSArray images = new JSArray();
                String outputPath = "";
                for (int index = 0; index < files.size(); index++) {
                    if (isCancelled(taskId)) {
                        deleteRecursively(tempDir);
                        rejectOnMain(call, "下载已取消");
                        return;
                    }

                    DownloadedSource source = files.get(index);
                    notifyProgress(taskId, index + 1, files.size(), title, "还原图片", "正在还原图片");
                    File file = source.segments > 0 ? decodeJmImage(source, tempDir, index) : source.file;
                    String outputExtension = source.segments > 0 ? ".jpg" : extensionOf(source.name);
                    String name = String.format(Locale.US, "%05d%s", index + 1, outputExtension);
                    notifyProgress(taskId, index + 1, files.size(), title, "写入目录", "正在写入目录");
                    WrittenImage written = targetUri == null || targetUri.isEmpty()
                        ? copyToDefaultFolder(title, name, mimeType(name), file)
                        : copyToTreeFolder(Uri.parse(targetUri), title, name, mimeType(name), file);
                    outputPath = written.folder;

                    JSObject item = new JSObject();
                    item.put("uri", written.uri);
                    item.put("name", name);
                    item.put("type", written.type);
                    images.put(item);
                }

                JSObject response = new JSObject();
                response.put("title", title);
                response.put("outputPath", outputPath);
                response.put("images", images);
                deleteRecursively(tempDir);
                resolveOnMain(call, response);
            } catch (Exception error) {
                deleteRecursively(tempDir);
                rejectOnMain(call, error.getMessage() == null ? "JM 下载失败" : error.getMessage());
            } finally {
                cancelledTasks.remove(taskId);
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String taskId = call.getString("taskId", "");
        if (!taskId.isEmpty()) {
            cancelledTasks.add(taskId);
        }
        JSObject result = new JSObject();
        result.put("cancelled", !taskId.isEmpty());
        call.resolve(result);
    }

    private Python python() {
        if (!Python.isStarted()) {
            Python.start(new AndroidPlatform(getContext()));
        }
        return Python.getInstance();
    }

    private boolean isCancelled(String taskId) {
        return cancelledTasks.contains(taskId);
    }

    private String stringFromResult(PyObject result, String key, String fallback) {
        try {
            PyObject value = result.callAttr("get", key, fallback);
            return value == null ? fallback : value.toString();
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private List<DownloadedSource> filesFromResult(PyObject result) {
        List<DownloadedSource> files = new ArrayList<>();
        try {
            PyObject imageList = result.callAttr("get", "images", new ArrayList<>());
            for (PyObject item : imageList.asList()) {
                try {
                    String path = String.valueOf(item.callAttr("get", "path", ""));
                    String name = String.valueOf(item.callAttr("get", "name", new File(path).getName()));
                    int segments = Integer.parseInt(String.valueOf(item.callAttr("get", "segments", 0)));
                    File file = new File(path);
                    if (file.isFile()) files.add(new DownloadedSource(file, name, Math.max(0, segments)));
                } catch (Exception ignored) {
                    File file = new File(item.toString());
                    if (file.isFile()) files.add(new DownloadedSource(file, file.getName(), 0));
                }
            }
        } catch (Exception ignored) {
            // Fall back to scanning the temporary directory.
        }
        return files;
    }

    private List<DownloadedSource> sourcesFromFiles(List<File> files) {
        List<DownloadedSource> sources = new ArrayList<>();
        for (File file : files) {
            sources.add(new DownloadedSource(file, file.getName(), 0));
        }
        return sources;
    }

    private List<File> collectImageFiles(File root) {
        List<File> files = new ArrayList<>();
        collectImageFiles(root, files);
        files.sort(Comparator.comparing(File::getAbsolutePath, this::naturalCompare));
        return files;
    }

    private void collectImageFiles(File root, List<File> files) {
        File[] children = root.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()) {
                collectImageFiles(child, files);
            } else if (IMAGE_SUFFIXES.contains(extensionOf(child.getName()).toLowerCase(Locale.ROOT))) {
                files.add(child);
            }
        }
    }

    private WrittenImage copyToTreeFolder(Uri targetUri, String title, String name, String type, File file) throws Exception {
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), targetUri);
        if (root == null || !root.isDirectory()) {
            throw new Exception("下载目录不可用，请重新选择");
        }

        String safeTitle = sanitizeFileName(title);
        DocumentFile mangaFolder = findChildDirectory(root, safeTitle);
        if (mangaFolder == null) {
            mangaFolder = root.createDirectory(safeTitle);
        }
        if (mangaFolder == null || !mangaFolder.isDirectory()) {
            throw new Exception("无法创建漫画下载目录");
        }

        DocumentFile existing = mangaFolder.findFile(name);
        if (existing != null) existing.delete();

        DocumentFile image = mangaFolder.createFile(type, name);
        if (image == null) {
            throw new Exception("无法创建下载图片");
        }

        copyFileToUri(file, image.getUri());
        return new WrittenImage(image.getUri().toString(), name, type, mangaFolder.getUri().toString());
    }

    private WrittenImage copyToDefaultFolder(String title, String name, String type, File file) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return copyToPublicDownloads(title, name, type, file);
        }

        File root = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Comicr");
        File mangaFolder = new File(root, sanitizeFileName(title));
        if (!mangaFolder.exists() && !mangaFolder.mkdirs()) {
            throw new Exception("无法创建默认下载目录");
        }

        File image = new File(mangaFolder, sanitizeFileName(name));
        copyFile(file, image);
        return new WrittenImage(Uri.fromFile(image).toString(), name, type, Uri.fromFile(mangaFolder).toString());
    }

    private WrittenImage copyToPublicDownloads(String title, String name, String type, File file) throws Exception {
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
            copyFileToUri(file, uri);
            ContentValues doneValues = new ContentValues();
            doneValues.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, doneValues, null, null);
        } catch (Exception error) {
            resolver.delete(uri, null, null);
            throw error;
        }

        return new WrittenImage(uri.toString(), name, type, "Download/Comicr/" + sanitizeFileName(title));
    }

    private void copyFileToUri(File file, Uri uri) throws Exception {
        try (FileInputStream input = new FileInputStream(file);
             OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new Exception("无法写入下载图片");
            copyStream(input, output);
        }
    }

    private void copyFile(File source, File target) throws Exception {
        try (FileInputStream input = new FileInputStream(source);
             FileOutputStream output = new FileOutputStream(target, false)) {
            copyStream(input, output);
        }
    }

    private File decodeJmImage(DownloadedSource source, File tempDir, int index) throws Exception {
        Bitmap original = BitmapFactory.decodeFile(source.file.getAbsolutePath());
        if (original == null) {
            throw new Exception("JM 图片解码失败：" + source.name + "，" + describeFileHeader(source.file));
        }

        int segments = Math.max(0, source.segments);
        if (segments <= 0) {
            return source.file;
        }

        int width = original.getWidth();
        int height = original.getHeight();
        int over = height % segments;
        int baseHeight = height / segments;
        Bitmap decoded = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(decoded);

        for (int segment = 0; segment < segments; segment++) {
            int move = baseHeight;
            int sourceY = height - (baseHeight * (segment + 1)) - over;
            int targetY = baseHeight * segment;

            if (segment == 0) {
                move += over;
            } else {
                targetY += over;
            }

            Bitmap piece = Bitmap.createBitmap(original, 0, sourceY, width, move);
            canvas.drawBitmap(piece, 0, targetY, null);
            piece.recycle();
        }

        File decodedDir = new File(tempDir, "decoded");
        if (!decodedDir.exists() && !decodedDir.mkdirs()) {
            throw new Exception("无法创建 JM 解码目录");
        }
        File output = new File(decodedDir, String.format(Locale.US, "%05d.jpg", index + 1));
        try (FileOutputStream stream = new FileOutputStream(output, false)) {
            if (!decoded.compress(Bitmap.CompressFormat.JPEG, 95, stream)) {
                throw new Exception("无法保存 JM 解码图片");
            }
        } finally {
            decoded.recycle();
            original.recycle();
        }
        return output;
    }

    private String describeFileHeader(File file) {
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] data = new byte[(int) Math.min(96, file.length())];
            int read = input.read(data);
            if (read <= 0) return "文件为空";
            String text = new String(data, 0, read, StandardCharsets.UTF_8)
                .replaceAll("\\s+", " ")
                .trim();
            return "大小 " + file.length() + " 字节，开头：" + text;
        } catch (Exception error) {
            return "无法读取文件头";
        }
    }

    private void copyStream(InputStream input, OutputStream output) throws Exception {
        byte[] buffer = new byte[1024 * 64];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
    }

    private DocumentFile findChildDirectory(DocumentFile root, String title) {
        for (DocumentFile child : root.listFiles()) {
            if (child.isDirectory() && title.equals(child.getName())) {
                return child;
            }
        }
        return null;
    }

    private String extensionOf(String value) {
        int index = value.lastIndexOf('.');
        return index >= 0 ? value.substring(index).toLowerCase(Locale.ROOT) : ".jpg";
    }

    private String mimeType(String name) {
        switch (extensionOf(name)) {
            case ".png":
                return "image/png";
            case ".webp":
                return "image/webp";
            case ".gif":
                return "image/gif";
            case ".bmp":
                return "image/bmp";
            default:
                return "image/jpeg";
        }
    }

    private String sanitizeFileName(String value) {
        String safeValue = value == null ? "" : value.trim();
        if (safeValue.isEmpty()) return "download";
        return safeValue.replaceAll("[\\\\/:*?\"<>|\\u0000-\\u001F]", "_");
    }

    private int naturalCompare(String left, String right) {
        String[] leftParts = left.split("(?<=\\D)(?=\\d)|(?<=\\d)(?=\\D)");
        String[] rightParts = right.split("(?<=\\D)(?=\\d)|(?<=\\d)(?=\\D)");
        int count = Math.min(leftParts.length, rightParts.length);
        for (int index = 0; index < count; index++) {
            String leftPart = leftParts[index];
            String rightPart = rightParts[index];
            int result;
            if (leftPart.matches("\\d+") && rightPart.matches("\\d+")) {
                result = Long.compare(Long.parseLong(leftPart), Long.parseLong(rightPart));
            } else {
                result = leftPart.compareToIgnoreCase(rightPart);
            }
            if (result != 0) return result;
        }
        return Integer.compare(leftParts.length, rightParts.length);
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        file.delete();
    }

    private void notifyProgress(String taskId, int current, int total, String title, String message) {
        notifyProgress(taskId, current, total, title, message, message);
    }

    private void notifyProgress(String taskId, int current, int total, String title, String phase, String message) {
        JSObject payload = new JSObject();
        payload.put("taskId", taskId);
        payload.put("current", current);
        payload.put("total", total);
        payload.put("title", title);
        payload.put("phase", phase);
        payload.put("message", message);
        getActivity().runOnUiThread(() -> notifyListeners("jmDownloadProgress", payload));
    }

    private void resolveOnMain(PluginCall call, JSObject response) {
        getActivity().runOnUiThread(() -> call.resolve(response));
    }

    private void rejectOnMain(PluginCall call, String message) {
        getActivity().runOnUiThread(() -> call.reject(message));
    }

    public class ProgressBridge {
        private final String taskId;
        private String title = "JM 下载";

        ProgressBridge(String taskId) {
            this.taskId = taskId;
        }

        public void onMeta(String title, int total) {
            if (title != null && !title.isEmpty()) {
                this.title = title;
            }
            notifyProgress(taskId, 0, total, this.title, "解析 JM 漫画");
        }

        public void onProgress(int current, int total, String message) {
            notifyProgress(taskId, current, total, title, "下载原图", "下载原图");
        }

        public boolean isCancelled() {
            return cancelledTasks.contains(taskId);
        }
    }

    private static class WrittenImage {
        final String uri;
        final String name;
        final String type;
        final String folder;

        WrittenImage(String uri, String name, String type, String folder) {
            this.uri = uri;
            this.name = name;
            this.type = type;
            this.folder = folder;
        }
    }

    private static class DownloadedSource {
        final File file;
        final String name;
        final int segments;

        DownloadedSource(File file, String name, int segments) {
            this.file = file;
            this.name = name;
            this.segments = segments;
        }
    }
}
