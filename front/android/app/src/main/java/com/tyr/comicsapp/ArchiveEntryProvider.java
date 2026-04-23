package com.tyr.comicsapp;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.util.Base64;

import java.io.FileNotFoundException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;

public class ArchiveEntryProvider extends ContentProvider {
    private static final int ZIP_CACHE_LIMIT = 2;
    private final Object zipCacheLock = new Object();
    private final LinkedHashMap<String, CachedZipArchive> zipCache = new LinkedHashMap<>(4, 0.75f, true);

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        try {
            return mimeType(parseRequest(uri).entryName);
        } catch (Exception ignored) {
            return "application/octet-stream";
        }
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (mode != null && !mode.contains("r")) {
            throw new FileNotFoundException("Archive pages are read only");
        }

        EntryRequest request = parseRequest(uri);
        ParcelFileDescriptor[] pipe;
        try {
            pipe = ParcelFileDescriptor.createPipe();
        } catch (Exception error) {
            throw new FileNotFoundException("Cannot create archive page pipe");
        }

        Thread writer = new Thread(
            () -> writeEntryToPipe(request, pipe[1]),
            "ComicrArchiveEntryProvider"
        );
        writer.start();
        return pipe[0];
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }

    private void writeEntryToPipe(EntryRequest request, ParcelFileDescriptor writeDescriptor) {
        try (OutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(writeDescriptor)) {
            try {
                copyEntryRandomAccess(request, output);
            } catch (Exception error) {
                removeCachedZipArchive(request.archiveUri);
                copyEntrySequential(request, output);
            }
        } catch (Exception ignored) {
            // Closing the pipe is enough for WebView to treat the image as failed.
        }
    }

    private void copyEntryRandomAccess(EntryRequest request, OutputStream output) throws Exception {
        CachedZipArchive cachedArchive = getCachedZipArchive(request.archiveUri);
        synchronized (cachedArchive) {
            ZipEntry entry = cachedArchive.zipFile.getEntry(request.entryName);
            if (entry == null || entry.isDirectory()) {
                throw new FileNotFoundException("Archive page not found");
            }

            try (InputStream input = cachedArchive.zipFile.getInputStream(entry)) {
                copy(input, output);
            }
        }
    }

    private void copyEntrySequential(EntryRequest request, OutputStream output) throws Exception {
        if (getContext() == null) throw new FileNotFoundException("Context unavailable");
        InputStream input = getContext().getContentResolver().openInputStream(request.archiveUri);
        if (input == null) throw new FileNotFoundException("Archive unavailable");

        try (InputStream archiveInput = input;
             ZipInputStream zip = new ZipInputStream(archiveInput)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!entry.isDirectory() && request.entryName.equals(entry.getName())) {
                    copy(zip, output);
                    return;
                }
                zip.closeEntry();
            }
        }

        throw new FileNotFoundException("Archive page not found");
    }

    private CachedZipArchive getCachedZipArchive(Uri archiveUri) throws Exception {
        String key = archiveUri.toString();
        synchronized (zipCacheLock) {
            CachedZipArchive cachedArchive = zipCache.get(key);
            if (cachedArchive != null) return cachedArchive;
            if (getContext() == null) throw new FileNotFoundException("Context unavailable");

            ParcelFileDescriptor descriptor = getContext().getContentResolver().openFileDescriptor(archiveUri, "r");
            if (descriptor == null) throw new FileNotFoundException("Archive unavailable");

            try {
                CachedZipArchive nextArchive = new CachedZipArchive(
                    descriptor,
                    new ZipFile("/proc/self/fd/" + descriptor.getFd())
                );
                zipCache.put(key, nextArchive);
                trimZipCacheLocked();
                return nextArchive;
            } catch (Exception error) {
                try {
                    descriptor.close();
                } catch (Exception ignored) {
                    // ignore
                }
                throw error;
            }
        }
    }

    private void trimZipCacheLocked() {
        while (zipCache.size() > ZIP_CACHE_LIMIT) {
            Map.Entry<String, CachedZipArchive> eldest = zipCache.entrySet().iterator().next();
            zipCache.remove(eldest.getKey());
            eldest.getValue().close();
        }
    }

    private void removeCachedZipArchive(Uri archiveUri) {
        synchronized (zipCacheLock) {
            CachedZipArchive cachedArchive = zipCache.remove(archiveUri.toString());
            if (cachedArchive != null) cachedArchive.close();
        }
    }

    private EntryRequest parseRequest(Uri uri) throws FileNotFoundException {
        List<String> segments = uri.getPathSegments();
        if (segments.size() < 3 || !"page".equals(segments.get(0))) {
            throw new FileNotFoundException("Invalid archive page uri");
        }

        return new EntryRequest(
            Uri.parse(decodeSegment(segments.get(1))),
            decodeSegment(segments.get(2))
        );
    }

    private String decodeSegment(String value) {
        byte[] bytes = Base64.decode(
            value,
            Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING
        );
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private void copy(InputStream input, OutputStream output) throws Exception {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
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

    private static class EntryRequest {
        final Uri archiveUri;
        final String entryName;

        EntryRequest(Uri archiveUri, String entryName) {
            this.archiveUri = archiveUri;
            this.entryName = entryName;
        }
    }

    private static class CachedZipArchive {
        final ParcelFileDescriptor descriptor;
        final ZipFile zipFile;

        CachedZipArchive(ParcelFileDescriptor descriptor, ZipFile zipFile) {
            this.descriptor = descriptor;
            this.zipFile = zipFile;
        }

        void close() {
            synchronized (this) {
                try {
                    zipFile.close();
                } catch (Exception ignored) {
                    // ignore
                }

                try {
                    descriptor.close();
                } catch (Exception ignored) {
                    // ignore
                }
            }
        }
    }
}
