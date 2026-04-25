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
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "LocalFolder")
public class LocalFolderPlugin extends Plugin {
    private static final int MAX_MANGAS = 300;
    private static final int MAX_IMAGES_PER_MANGA = 3000;
    private static final List<String> CONTENT_DIRECTORY_NAMES = Arrays.asList(
        "page", "pages", "image", "images", "img", "imgs", "raw", "scan", "scans", "original", "origin"
    );

    private final ExecutorService scannerExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @PluginMethod
    public void scanFolder(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isEmpty()) {
            call.reject("缺少已授权目录");
            return;
        }

        Uri treeUri = Uri.parse(uriValue);
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        if (root == null || !root.isDirectory()) {
            call.reject("已授权目录不可用，请重新选择漫画库文件夹");
            return;
        }

        scannerExecutor.execute(() -> {
            try {
                resolveOnMain(call, buildFolderResponse(root, treeUri));
            } catch (Exception error) {
                rejectOnMain(call, error.getMessage() == null ? "文件夹扫描失败" : error.getMessage());
            }
        });
    }

    @PluginMethod
    public void readImage(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isEmpty()) {
            call.reject("缺少图片地址");
            return;
        }

        Uri uri = Uri.parse(uriValue);

        scannerExecutor.execute(() -> {
            try {
                JSObject response = new JSObject();
                response.put("type", mimeType(uri));
                response.put("base64", readBase64(uri));
                resolveOnMain(call, response);
            } catch (Exception error) {
                rejectOnMain(call, error.getMessage() == null ? "读取图片失败" : error.getMessage());
            }
        });
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isEmpty()) {
            call.reject("缂哄皯鏂囦欢鍦板潃");
            return;
        }

        Uri uri = Uri.parse(uriValue);

        scannerExecutor.execute(() -> {
            try {
                JSObject response = new JSObject();
                response.put("name", queryDisplayName(uri, "document"));
                response.put("type", mimeType(uri));
                response.put("base64", readBase64(uri));
                resolveOnMain(call, response);
            } catch (Exception error) {
                rejectOnMain(call, error.getMessage() == null ? "璇诲彇鏂囦欢澶辫触" : error.getMessage());
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
                resolveOnMain(call, buildFolderResponse(root, treeUri));
            } catch (Exception error) {
                rejectOnMain(call, error.getMessage() == null ? "文件夹扫描失败" : error.getMessage());
            }
        });
    }

    private JSObject buildFolderResponse(DocumentFile root, Uri treeUri) throws Exception {
        List<ScannedManga> mangas = scanRoot(root, treeUri);
        if (mangas.isEmpty()) {
            throw new Exception("文件夹里没有识别到漫画目录、压缩包、EPUB 或 TXT");
        }

        JSArray mangaItems = new JSArray();
        for (ScannedManga manga : mangas) {
            JSObject item = new JSObject();
            item.put("id", manga.id);
            item.put("title", manga.title);
            item.put("imageCount", manga.pages.size());
            item.put("structureType", manga.structureType);
            item.put("sourceType", manga.sourceType);
            item.put("sourceKey", manga.sourceKey);
            if (manga.sourceVersionKey != null) item.put("sourceVersionKey", manga.sourceVersionKey);
            item.put("pages", pagesToJson(manga.pages));
            mangaItems.put(item);
        }

        JSObject response = new JSObject();
        response.put("rootTitle", safeName(root, "漫画库"));
        response.put("rootUri", treeUri.toString());
        response.put("mangas", mangaItems);
        return response;
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

        appendArchiveMangas(mangas, rootSnapshot.archiveFiles);
        appendReaderMangas(mangas, rootSnapshot.readerFiles);

        List<DocumentFile> childDirs = sortedFiles(rootSnapshot.childDirs);
        for (DocumentFile child : childDirs) {
            if (mangas.size() >= MAX_MANGAS) break;

            DirectorySnapshot childSnapshot = snapshot(child);
            ScannedManga manga = buildManga(childSnapshot, null, false);
            if (manga != null) mangas.add(manga);
            appendArchiveMangas(mangas, childSnapshot.archiveFiles);
            appendReaderMangas(mangas, childSnapshot.readerFiles);
        }

        return mangas;
    }

    private void appendArchiveMangas(List<ScannedManga> mangas, List<DocumentFile> archiveFiles) {
        for (DocumentFile archive : sortedFiles(archiveFiles)) {
            if (mangas.size() >= MAX_MANGAS) return;
            ScannedManga manga = buildArchiveManga(archive);
            if (manga != null) mangas.add(manga);
        }
    }

    private void appendReaderMangas(List<ScannedManga> mangas, List<DocumentFile> readerFiles) {
        for (DocumentFile file : sortedFiles(readerFiles)) {
            if (mangas.size() >= MAX_MANGAS) return;
            ScannedManga manga = buildReaderManga(file);
            if (manga != null) mangas.add(manga);
        }
    }

    private boolean shouldTreatSelectionAsSingleManga(DirectorySnapshot root) {
        List<DirectorySnapshot> imageChildren = imageChildSnapshots(root);
        if (!root.imageFiles.isEmpty()) {
            if (imageChildren.isEmpty()) return true;
            return !isLibraryDirectoryName(root.name);
        }

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

        List<DirectorySnapshot> imageChildren = imageChildSnapshots(mangaDir);
        List<DocumentFile> directPages = contentImages(mangaDir.imageFiles, !imageChildren.isEmpty());

        if (!directPages.isEmpty()) {
            appendPages(pages, "", directPages);
        } else {
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
            "folder",
            mangaDir.uri,
            null,
            pages
        );
    }

    private ScannedManga buildArchiveManga(DocumentFile archive) {
        List<PageFile> pages = scanArchivePages(archive.getUri());
        if (pages.isEmpty()) return null;

        String title = cleanArchiveTitle(safeName(archive, "压缩包漫画"));
        return new ScannedManga(
            UUID.randomUUID().toString(),
            title,
            "archive",
            "archive",
            archive.getUri().toString(),
            versionKeyFor(archive),
            pages
        );
    }

    private ScannedManga buildReaderManga(DocumentFile file) {
        String name = safeName(file, "document");
        String lower = name.toLowerCase(Locale.ROOT);
        String sourceType = lower.endsWith(".epub") ? "epub" : "txt";
        String title = cleanReaderTitle(name, sourceType);
        List<PageFile> pages = new ArrayList<>();
        pages.add(new PageFile(name, mimeType(file.getUri()), file.getUri().toString(), null, null));

        return new ScannedManga(
            UUID.randomUUID().toString(),
            title,
            sourceType,
            sourceType,
            file.getUri().toString(),
            versionKeyFor(file),
            pages
        );
    }

    private DirectorySnapshot snapshot(DocumentFile folder) {
        List<DocumentFile> imageFiles = new ArrayList<>();
        List<DocumentFile> childDirs = new ArrayList<>();
        List<DocumentFile> archiveFiles = new ArrayList<>();
        List<DocumentFile> readerFiles = new ArrayList<>();

        for (DocumentFile file : folder.listFiles()) {
            if (file.isDirectory()) {
                childDirs.add(file);
            } else if (isImage(file)) {
                imageFiles.add(file);
            } else if (isArchive(file)) {
                archiveFiles.add(file);
            } else if (isReaderFile(file)) {
                readerFiles.add(file);
            }
        }

        imageFiles = sortedFiles(imageFiles);
        childDirs = sortedFiles(childDirs);
        archiveFiles = sortedFiles(archiveFiles);
        readerFiles = sortedFiles(readerFiles);
        return new DirectorySnapshot(safeName(folder, "未命名目录"), folder.getUri().toString(), imageFiles, childDirs, archiveFiles, readerFiles);
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
            pages.add(new PageFile(displayName, mimeType(image), image.getUri().toString(), null, null));
        }
    }

    private List<DocumentFile> contentImages(List<DocumentFile> imageFiles, boolean hasImageChildDirectories) {
        if (!hasImageChildDirectories) return imageFiles;

        List<DocumentFile> contentImages = new ArrayList<>();
        for (DocumentFile image : imageFiles) {
            if (!isCoverImageName(safeName(image, ""))) {
                contentImages.add(image);
            }
        }
        return contentImages;
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

    private boolean isArchive(DocumentFile file) {
        String name = file.getName();
        if (name == null) return false;

        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".zip") || lower.endsWith(".cbz");
    }

    private boolean isReaderFile(DocumentFile file) {
        String name = file.getName();
        String type = file.getType();
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".epub") || lower.endsWith(".txt")) return true;
        return "application/epub+zip".equals(type) || "text/plain".equals(type);
    }

    private List<PageFile> scanArchivePages(Uri archiveUri) {
        List<PageFile> pages = new ArrayList<>();
        InputStream input = null;
        try {
            input = getContext().getContentResolver().openInputStream(archiveUri);
            if (input == null) return pages;

            try (InputStream archiveInput = input;
                 ZipInputStream zip = new ZipInputStream(archiveInput)) {
                input = null;

                while (pages.size() < MAX_IMAGES_PER_MANGA) {
                    ZipEntry entry = zip.getNextEntry();
                    if (entry == null) break;
                    if (!entry.isDirectory() && isImageName(entry.getName())) {
                        pages.add(new PageFile(
                            displayName(entry.getName()),
                            mimeType(entry.getName()),
                            null,
                            archiveUri.toString(),
                            entry.getName()
                        ));
                    }
                    zip.closeEntry();
                }
            }
        } catch (Exception ignored) {
            // Keep readable pages from partial archives.
        } finally {
            if (input != null) {
                try {
                    input.close();
                } catch (Exception ignored) {
                    // ignore
                }
            }
        }

        pages.sort(Comparator.comparing(page -> page.displayName, this::naturalCompare));
        return pages;
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

    private boolean isCoverImageName(String name) {
        String lower = name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
        int dotIndex = lower.lastIndexOf('.');
        String baseName = dotIndex >= 0 ? lower.substring(0, dotIndex) : lower;
        return baseName.equals("cover")
            || baseName.equals("folder")
            || baseName.equals("thumb")
            || baseName.equals("thumbnail")
            || baseName.equals("poster");
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

    private String mimeType(Uri uri) {
        String type = getContext().getContentResolver().getType(uri);
        if (type != null && !type.isEmpty()) return type;

        String name = queryDisplayName(uri, "");
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".epub")) return "application/epub+zip";
        if (lower.endsWith(".txt")) return "text/plain";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".avif")) return "image/avif";
        return "image/jpeg";
    }

    private String mimeType(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".epub")) return "application/epub+zip";
        if (lower.endsWith(".txt")) return "text/plain";
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

    private String cleanReaderTitle(String name, String sourceType) {
        String fallback = "epub".equals(sourceType) ? "未命名漫画" : "未命名小说";
        String safeName = name == null || name.isEmpty() ? fallback : name;
        String title = safeName.replaceAll("(?i)\\.(epub|txt)$", "").trim();
        return title.isEmpty() ? fallback : title;
    }

    private String versionKeyFor(DocumentFile file) {
        return file.getUri().toString() + ":" + file.lastModified() + ":" + file.length();
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

    private JSArray pagesToJson(List<PageFile> pages) {
        JSArray items = new JSArray();
        for (PageFile page : pages) {
            JSObject item = new JSObject();
            item.put("name", page.displayName);
            item.put("type", page.type);
            if (page.uri != null) item.put("uri", page.uri);
            if (page.archiveUri != null) item.put("archiveUri", page.archiveUri);
            if (page.entryName != null) item.put("entryName", page.entryName);
            items.put(item);
        }
        return items;
    }

    private void resolveOnMain(PluginCall call, JSObject response) {
        getActivity().runOnUiThread(() -> call.resolve(response));
    }

    private void rejectOnMain(PluginCall call, String message) {
        getActivity().runOnUiThread(() -> call.reject(message));
    }

    private static class DirectorySnapshot {
        final String name;
        final String uri;
        final List<DocumentFile> imageFiles;
        final List<DocumentFile> childDirs;
        final List<DocumentFile> archiveFiles;
        final List<DocumentFile> readerFiles;

        DirectorySnapshot(String name, String uri, List<DocumentFile> imageFiles, List<DocumentFile> childDirs, List<DocumentFile> archiveFiles, List<DocumentFile> readerFiles) {
            this.name = name;
            this.uri = uri;
            this.imageFiles = imageFiles;
            this.childDirs = childDirs;
            this.archiveFiles = archiveFiles;
            this.readerFiles = readerFiles;
        }
    }

    private static class ScannedManga {
        final String id;
        final String title;
        final String structureType;
        final String sourceType;
        final String sourceKey;
        final String sourceVersionKey;
        final List<PageFile> pages;

        ScannedManga(String id, String title, String structureType, String sourceType, String sourceKey, String sourceVersionKey, List<PageFile> pages) {
            this.id = id;
            this.title = title;
            this.structureType = structureType;
            this.sourceType = sourceType;
            this.sourceKey = sourceKey;
            this.sourceVersionKey = sourceVersionKey;
            this.pages = pages;
        }
    }

    private static class PageFile {
        final String displayName;
        final String type;
        final String uri;
        final String archiveUri;
        final String entryName;

        PageFile(String displayName, String type, String uri, String archiveUri, String entryName) {
            this.displayName = displayName;
            this.type = type;
            this.uri = uri;
            this.archiveUri = archiveUri;
            this.entryName = entryName;
        }
    }
}
