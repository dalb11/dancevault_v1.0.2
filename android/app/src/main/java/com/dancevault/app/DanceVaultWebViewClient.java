package com.dancevault.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Intercepts same-origin `/_dv_media?uri=<contentUri>` requests inside the Capacitor WebView
 * and streams original Android content:// videos directly with HTTP 206 byte-range seeking
 * and zero file duplication.
 */
public class DanceVaultWebViewClient extends BridgeWebViewClient {

    public static final String MEDIA_ROUTE_PATH = "/_dv_media";

    private final Bridge appBridge;

    public DanceVaultWebViewClient(Bridge bridge) {
        super(bridge);
        this.appBridge = bridge;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri requestUri = request.getUrl();
        if (requestUri != null && MEDIA_ROUTE_PATH.equals(requestUri.getPath())) {
            String encodedContentUri = requestUri.getQueryParameter("uri");
            if (encodedContentUri == null || encodedContentUri.trim().isEmpty()) {
                return buildErrorResponse(400, "Bad Request");
            }
            return serveContentUriWithRange(request, Uri.parse(encodedContentUri.trim()));
        }
        return super.shouldInterceptRequest(view, request);
    }

    private WebResourceResponse serveContentUriWithRange(WebResourceRequest request, Uri contentUri) {
        Context context = appBridge.getContext();
        ContentResolver resolver = context.getContentResolver();

        String mimeType = resolver.getType(contentUri);
        if (mimeType == null || mimeType.trim().isEmpty()) {
            mimeType = "video/mp4";
        }

        ParcelFileDescriptor pfd = null;
        try {
            pfd = resolver.openFileDescriptor(contentUri, "r");
            if (pfd == null) {
                return buildErrorResponse(404, "Not Found");
            }

            long totalLength = pfd.getStatSize();
            if (totalLength <= 0) {
                totalLength = querySizeFallback(resolver, contentUri);
            }

            Map<String, String> requestHeaders = request.getRequestHeaders();
            String rangeHeader = null;
            if (requestHeaders != null) {
                rangeHeader = requestHeaders.get("Range");
                if (rangeHeader == null) {
                    rangeHeader = requestHeaders.get("range");
                }
            }

            if (rangeHeader != null && rangeHeader.startsWith("bytes=") && totalLength > 0) {
                String spec = rangeHeader.substring("bytes=".length()).trim();
                int commaIdx = spec.indexOf(',');
                if (commaIdx >= 0) {
                    spec = spec.substring(0, commaIdx).trim();
                }

                long start = 0;
                long end = totalLength - 1;
                int dashIdx = spec.indexOf('-');
                if (dashIdx < 0) {
                    closeQuietly(pfd);
                    return buildRangeNotSatisfiable(totalLength);
                }

                String startPart = spec.substring(0, dashIdx).trim();
                String endPart = spec.substring(dashIdx + 1).trim();

                if (startPart.isEmpty()) {
                    long suffixLength = Long.parseLong(endPart);
                    if (suffixLength <= 0) {
                        closeQuietly(pfd);
                        return buildRangeNotSatisfiable(totalLength);
                    }
                    start = Math.max(0, totalLength - suffixLength);
                } else {
                    start = Long.parseLong(startPart);
                    if (!endPart.isEmpty()) {
                        end = Math.min(Long.parseLong(endPart), totalLength - 1);
                    }
                }

                if (start < 0 || start >= totalLength || end < start) {
                    closeQuietly(pfd);
                    return buildRangeNotSatisfiable(totalLength);
                }

                long rangeLength = (end - start) + 1;
                FileInputStream fis = new FileInputStream(pfd.getFileDescriptor());
                seekStreamToOffset(fis, start);

                Map<String, String> headers = new HashMap<>();
                headers.put("Accept-Ranges", "bytes");
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + totalLength);
                headers.put("Content-Length", String.valueOf(rangeLength));
                headers.put("Access-Control-Allow-Origin", "*");
                headers.put("Cache-Control", "no-store");

                return new WebResourceResponse(
                    mimeType,
                    null,
                    206,
                    "Partial Content",
                    headers,
                    new BoundedContentStream(fis, pfd, rangeLength)
                );
            }

            FileInputStream fis = new FileInputStream(pfd.getFileDescriptor());
            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-store");
            if (totalLength > 0) {
                headers.put("Content-Length", String.valueOf(totalLength));
            }

            InputStream stream = totalLength > 0
                ? new BoundedContentStream(fis, pfd, totalLength)
                : new ClosingContentStream(fis, pfd);

            return new WebResourceResponse(mimeType, null, 200, "OK", headers, stream);
        } catch (Exception e) {
            closeQuietly(pfd);
            return buildErrorResponse(404, "Not Found");
        }
    }

    private static void seekStreamToOffset(FileInputStream fis, long offset) throws IOException {
        if (offset <= 0) return;
        try {
            fis.getChannel().position(offset);
            return;
        } catch (IOException ignored) {
            // Fall through to sequential skip on non-seekable streams
        }
        long remaining = offset;
        byte[] discard = new byte[8192];
        while (remaining > 0) {
            long skipped = fis.skip(remaining);
            if (skipped > 0) {
                remaining -= skipped;
            } else {
                int read = fis.read(discard, 0, (int) Math.min(discard.length, remaining));
                if (read < 0) break;
                remaining -= read;
            }
        }
    }

    private static long querySizeFallback(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (idx >= 0 && !cursor.isNull(idx)) {
                    long size = cursor.getLong(idx);
                    if (size > 0) return size;
                }
            }
        } catch (Exception ignored) {}

        try (AssetFileDescriptor afd = resolver.openAssetFileDescriptor(uri, "r")) {
            if (afd != null && afd.getLength() > 0) {
                return afd.getLength();
            }
        } catch (Exception ignored) {}

        return -1;
    }

    private static WebResourceResponse buildErrorResponse(int code, String reason) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse(
            "text/plain",
            "UTF-8",
            code,
            reason,
            headers,
            new ByteArrayInputStream(reason.getBytes(StandardCharsets.UTF_8))
        );
    }

    private static WebResourceResponse buildRangeNotSatisfiable(long totalLength) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Range", "bytes */" + totalLength);
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse(
            "text/plain",
            "UTF-8",
            416,
            "Range Not Satisfiable",
            headers,
            new ByteArrayInputStream(new byte[0])
        );
    }

    private static void closeQuietly(ParcelFileDescriptor pfd) {
        if (pfd != null) {
            try {
                pfd.close();
            } catch (IOException ignored) {}
        }
    }

    private static final class BoundedContentStream extends InputStream {
        private final FileInputStream fis;
        private final ParcelFileDescriptor pfd;
        private long remaining;

        BoundedContentStream(FileInputStream fis, ParcelFileDescriptor pfd, long length) {
            this.fis = fis;
            this.pfd = pfd;
            this.remaining = length;
        }

        @Override
        public int available() {
            return (int) Math.min(Math.max(0L, remaining), Integer.MAX_VALUE);
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int b = fis.read();
            if (b >= 0) {
                remaining -= 1;
            }
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int toRead = (int) Math.min(len, remaining);
            int count = fis.read(b, off, toRead);
            if (count > 0) {
                remaining -= count;
            }
            return count;
        }

        @Override
        public void close() throws IOException {
            try {
                fis.close();
            } finally {
                pfd.close();
            }
        }
    }

    private static final class ClosingContentStream extends InputStream {
        private final FileInputStream fis;
        private final ParcelFileDescriptor pfd;

        ClosingContentStream(FileInputStream fis, ParcelFileDescriptor pfd) {
            this.fis = fis;
            this.pfd = pfd;
        }

        @Override
        public int available() throws IOException {
            return fis.available();
        }

        @Override
        public int read() throws IOException {
            return fis.read();
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            return fis.read(b, off, len);
        }

        @Override
        public void close() throws IOException {
            try {
                fis.close();
            } finally {
                pfd.close();
            }
        }
    }
}
