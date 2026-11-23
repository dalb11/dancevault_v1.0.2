package com.dancevault.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Embedded loopback HTTP/1.1 byte-range streaming server bound strictly to 127.0.0.1.
 *
 * Sacred DanceVault guarantees:
 * - Zero disk copies and zero temporary files: reads directly from Android's content://
 *   file descriptor and writes straight to the loopback socket in RAM.
 * - Protected by a per-process random session token and restricted to content:// URIs.
 * - Full HTTP 206 Partial Content support for instant MP4 seeking, A-B loops, slow-mo,
 *   and CORS headers so HTML5 canvas frame capture works cleanly.
 */
public final class DanceVaultMediaServer {

    private final Context appContext;
    private final String sessionToken;
    private final ExecutorService clientExecutor = Executors.newCachedThreadPool();

    private ServerSocket serverSocket;
    private Thread acceptThread;
    private volatile boolean running = false;
    private volatile int port = -1;

    public DanceVaultMediaServer(Context context) {
        this.appContext = context.getApplicationContext();
        this.sessionToken = UUID.randomUUID().toString().replace("-", "");
    }

    public synchronized void ensureStarted() throws IOException {
        if (running && serverSocket != null && !serverSocket.isClosed() && port > 0) {
            return;
        }
        stop();

        serverSocket = new ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"));
        port = serverSocket.getLocalPort();
        running = true;

        acceptThread = new Thread(this::acceptLoop, "DanceVaultMediaServer-Accept");
        acceptThread.setDaemon(true);
        acceptThread.start();
    }

    public int getPort() {
        return port;
    }

    public String getToken() {
        return sessionToken;
    }

    public String getBaseUrl() {
        if (port <= 0) return "";
        return "http://127.0.0.1:" + port;
    }

    public String buildMediaUrl(String contentUri) {
        if (port <= 0 || contentUri == null || contentUri.trim().isEmpty()) {
            return "";
        }
        return "http://127.0.0.1:" + port
            + "/media?token=" + Uri.encode(sessionToken)
            + "&uri=" + Uri.encode(contentUri.trim());
    }

    public synchronized void stop() {
        running = false;
        port = -1;
        if (serverSocket != null) {
            try {
                serverSocket.close();
            } catch (IOException ignored) {}
            serverSocket = null;
        }
        if (acceptThread != null) {
            acceptThread.interrupt();
            acceptThread = null;
        }
    }

    public synchronized void shutdown() {
        stop();
        clientExecutor.shutdownNow();
    }

    private void acceptLoop() {
        while (running && serverSocket != null && !serverSocket.isClosed()) {
            try {
                Socket client = serverSocket.accept();
                clientExecutor.execute(() -> handleClient(client));
            } catch (IOException e) {
                if (!running) break;
            }
        }
    }

    private void handleClient(Socket socket) {
        try (Socket s = socket) {
            s.setTcpNoDelay(true);
            BufferedInputStream in = new BufferedInputStream(s.getInputStream(), 8192);
            BufferedOutputStream out = new BufferedOutputStream(s.getOutputStream(), 65536);

            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) {
                return;
            }

            Map<String, String> reqHeaders = new HashMap<>();
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                int colon = line.indexOf(':');
                if (colon > 0) {
                    String name = line.substring(0, colon).trim().toLowerCase(Locale.ROOT);
                    String value = line.substring(colon + 1).trim();
                    reqHeaders.put(name, value);
                }
            }

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                sendSimpleError(out, 400, "Bad Request");
                return;
            }

            String method = parts[0].trim().toUpperCase(Locale.ROOT);
            String rawTarget = parts[1].trim();

            if ("OPTIONS".equals(method)) {
                sendOptionsPreflight(out);
                return;
            }
            if (!"GET".equals(method) && !"HEAD".equals(method)) {
                sendSimpleError(out, 405, "Method Not Allowed");
                return;
            }

            Map<String, String> query = parseQueryParams(rawTarget);
            String pathOnly = rawTarget;
            int qIdx = rawTarget.indexOf('?');
            if (qIdx >= 0) {
                pathOnly = rawTarget.substring(0, qIdx);
            }
            if (!"/media".equals(pathOnly)) {
                sendSimpleError(out, 404, "Not Found");
                return;
            }

            String token = query.get("token");
            if (!sessionToken.equals(token)) {
                sendSimpleError(out, 403, "Forbidden");
                return;
            }

            String uriStr = query.get("uri");
            if (uriStr == null || uriStr.trim().isEmpty()) {
                sendSimpleError(out, 400, "Missing URI");
                return;
            }

            Uri contentUri = Uri.parse(uriStr.trim());
            if (!"content".equalsIgnoreCase(contentUri.getScheme())) {
                sendSimpleError(out, 403, "Only content URIs allowed");
                return;
            }

            streamContentUri(out, method, reqHeaders, contentUri);
        } catch (SocketException ignored) {
            // Normal when HTML5 <video> aborts an in-flight chunk during seeking
        } catch (Exception ignored) {
        }
    }

    private void streamContentUri(
        BufferedOutputStream out,
        String method,
        Map<String, String> reqHeaders,
        Uri contentUri
    ) throws IOException {
        ContentResolver resolver = appContext.getContentResolver();
        AssetFileDescriptor afd = null;
        ParcelFileDescriptor pfd = null;
        FileInputStream fis = null;

        try {
            long baseOffset = 0L;
            long totalLength = -1L;

            try {
                afd = resolver.openAssetFileDescriptor(contentUri, "r");
            } catch (Exception ignored) {
                afd = null;
            }

            if (afd != null) {
                baseOffset = Math.max(0L, afd.getStartOffset());
                totalLength = afd.getLength();
                pfd = afd.getParcelFileDescriptor();
            } else {
                pfd = resolver.openFileDescriptor(contentUri, "r");
            }

            if (pfd == null) {
                sendSimpleError(out, 404, "Not Found");
                return;
            }

            fis = new FileInputStream(pfd.getFileDescriptor());

            if (totalLength <= 0) {
                long statSize = pfd.getStatSize();
                if (statSize > 0) {
                    totalLength = statSize;
                }
            }
            if (totalLength <= 0) {
                totalLength = querySizeCursor(resolver, contentUri);
            }
            if (totalLength <= 0) {
                try {
                    long channelSize = fis.getChannel().size() - baseOffset;
                    if (channelSize > 0) {
                        totalLength = channelSize;
                    }
                } catch (IOException ignored) {}
            }

            String mimeType = resolveVideoMimeType(resolver, contentUri);
            String rangeHeader = reqHeaders.get("range");

            if (rangeHeader != null && rangeHeader.startsWith("bytes=") && totalLength > 0) {
                String spec = rangeHeader.substring("bytes=".length()).trim();
                int commaIdx = spec.indexOf(',');
                if (commaIdx >= 0) {
                    spec = spec.substring(0, commaIdx).trim();
                }

                int dashIdx = spec.indexOf('-');
                if (dashIdx < 0) {
                    sendRangeNotSatisfiable(out, totalLength);
                    return;
                }

                String startPart = spec.substring(0, dashIdx).trim();
                String endPart = spec.substring(dashIdx + 1).trim();

                long start;
                long end = totalLength - 1;

                try {
                    if (startPart.isEmpty()) {
                        long suffixLen = Long.parseLong(endPart);
                        if (suffixLen <= 0) {
                            sendRangeNotSatisfiable(out, totalLength);
                            return;
                        }
                        start = Math.max(0L, totalLength - suffixLen);
                    } else {
                        start = Long.parseLong(startPart);
                        if (!endPart.isEmpty()) {
                            end = Math.min(Long.parseLong(endPart), totalLength - 1);
                        }
                    }
                } catch (NumberFormatException e) {
                    sendRangeNotSatisfiable(out, totalLength);
                    return;
                }

                if (start < 0 || start >= totalLength || end < start) {
                    sendRangeNotSatisfiable(out, totalLength);
                    return;
                }

                long contentLength = (end - start) + 1;
                StringBuilder header = new StringBuilder();
                header.append("HTTP/1.1 206 Partial Content\r\n");
                header.append("Content-Type: ").append(mimeType).append("\r\n");
                header.append("Accept-Ranges: bytes\r\n");
                header.append("Content-Range: bytes ").append(start).append('-').append(end).append('/').append(totalLength).append("\r\n");
                header.append("Content-Length: ").append(contentLength).append("\r\n");
                appendCorsAndCacheHeaders(header);
                header.append("Connection: close\r\n\r\n");
                out.write(header.toString().getBytes(StandardCharsets.US_ASCII));

                if (!"HEAD".equals(method)) {
                    seekStream(fis, baseOffset + start);
                    copyBounded(fis, out, contentLength);
                }
                out.flush();
                return;
            }

            StringBuilder header = new StringBuilder();
            header.append("HTTP/1.1 200 OK\r\n");
            header.append("Content-Type: ").append(mimeType).append("\r\n");
            header.append("Accept-Ranges: bytes\r\n");
            if (totalLength > 0) {
                header.append("Content-Length: ").append(totalLength).append("\r\n");
            }
            appendCorsAndCacheHeaders(header);
            header.append("Connection: close\r\n\r\n");
            out.write(header.toString().getBytes(StandardCharsets.US_ASCII));

            if (!"HEAD".equals(method)) {
                if (baseOffset > 0) {
                    seekStream(fis, baseOffset);
                }
                if (totalLength > 0) {
                    copyBounded(fis, out, totalLength);
                } else {
                    copyAll(fis, out);
                }
            }
            out.flush();
        } finally {
            if (fis != null) {
                try { fis.close(); } catch (IOException ignored) {}
            }
            if (afd != null) {
                try { afd.close(); } catch (IOException ignored) {}
            } else if (pfd != null) {
                try { pfd.close(); } catch (IOException ignored) {}
            }
        }
    }

    private static void appendCorsAndCacheHeaders(StringBuilder sb) {
        sb.append("Access-Control-Allow-Origin: *\r\n");
        sb.append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
        sb.append("Access-Control-Allow-Headers: Range, Origin, Content-Type, Accept\r\n");
        sb.append("Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n");
        sb.append("Cache-Control: no-store\r\n");
    }

    private static void sendOptionsPreflight(OutputStream out) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("HTTP/1.1 204 No Content\r\n");
        appendCorsAndCacheHeaders(sb);
        sb.append("Access-Control-Max-Age: 86400\r\n");
        sb.append("Connection: close\r\n\r\n");
        out.write(sb.toString().getBytes(StandardCharsets.US_ASCII));
        out.flush();
    }

    private static void sendSimpleError(OutputStream out, int code, String reason) throws IOException {
        byte[] body = reason.getBytes(StandardCharsets.UTF_8);
        StringBuilder sb = new StringBuilder();
        sb.append("HTTP/1.1 ").append(code).append(' ').append(reason).append("\r\n");
        sb.append("Content-Type: text/plain; charset=utf-8\r\n");
        sb.append("Content-Length: ").append(body.length).append("\r\n");
        appendCorsAndCacheHeaders(sb);
        sb.append("Connection: close\r\n\r\n");
        out.write(sb.toString().getBytes(StandardCharsets.US_ASCII));
        out.write(body);
        out.flush();
    }

    private static void sendRangeNotSatisfiable(OutputStream out, long totalLength) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("HTTP/1.1 416 Range Not Satisfiable\r\n");
        sb.append("Content-Range: bytes */").append(totalLength).append("\r\n");
        sb.append("Content-Length: 0\r\n");
        appendCorsAndCacheHeaders(sb);
        sb.append("Connection: close\r\n\r\n");
        out.write(sb.toString().getBytes(StandardCharsets.US_ASCII));
        out.flush();
    }

    private static void seekStream(FileInputStream fis, long offset) throws IOException {
        if (offset <= 0) return;
        try {
            fis.getChannel().position(offset);
            return;
        } catch (Exception ignored) {
            // Fall through to sequential skip when descriptor isn't directly seekable
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

    private static void copyBounded(FileInputStream fis, OutputStream out, long length) throws IOException {
        byte[] buffer = new byte[65536];
        long remaining = length;
        while (remaining > 0) {
            int toRead = (int) Math.min(buffer.length, remaining);
            int read = fis.read(buffer, 0, toRead);
            if (read < 0) break;
            out.write(buffer, 0, read);
            remaining -= read;
        }
    }

    private static void copyAll(FileInputStream fis, OutputStream out) throws IOException {
        byte[] buffer = new byte[65536];
        int read;
        while ((read = fis.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
    }

    private static long querySizeCursor(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (idx >= 0 && !cursor.isNull(idx)) {
                    long size = cursor.getLong(idx);
                    if (size > 0) return size;
                }
            }
        } catch (Exception ignored) {}
        return -1L;
    }

    private static String resolveVideoMimeType(ContentResolver resolver, Uri uri) {
        String mime = null;
        try {
            mime = resolver.getType(uri);
        } catch (Exception ignored) {}

        if (mime != null) {
            String trimmed = mime.trim().toLowerCase(Locale.ROOT);
            if (!trimmed.isEmpty() && !"application/octet-stream".equals(trimmed) && !"*/*".equals(trimmed)) {
                return trimmed;
            }
        }

        String name = null;
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) name = cursor.getString(idx);
            }
        } catch (Exception ignored) {}

        if (name == null) {
            name = uri.getLastPathSegment();
        }
        if (name != null) {
            String lower = name.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".mov")) return "video/quicktime";
            if (lower.endsWith(".webm")) return "video/webm";
            if (lower.endsWith(".mkv")) return "video/x-matroska";
            if (lower.endsWith(".3gp")) return "video/3gpp";
            if (lower.endsWith(".avi")) return "video/x-msvideo";
        }
        return "video/mp4";
    }

    private static Map<String, String> parseQueryParams(String rawTarget) {
        Map<String, String> params = new HashMap<>();
        int qIdx = rawTarget.indexOf('?');
        if (qIdx < 0 || qIdx + 1 >= rawTarget.length()) {
            return params;
        }
        String queryStr = rawTarget.substring(qIdx + 1);
        for (String pair : queryStr.split("&")) {
            int eqIdx = pair.indexOf('=');
            if (eqIdx <= 0) continue;
            try {
                String k = URLDecoder.decode(pair.substring(0, eqIdx), "UTF-8");
                String v = URLDecoder.decode(pair.substring(eqIdx + 1), "UTF-8");
                params.put(k, v);
            } catch (Exception ignored) {}
        }
        return params;
    }

    private static String readLine(BufferedInputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int b;
        while ((b = in.read()) != -1) {
            if (b == '\r') {
                in.mark(1);
                int next = in.read();
                if (next != '\n' && next != -1) {
                    in.reset();
                }
                break;
            } else if (b == '\n') {
                break;
            } else {
                sb.append((char) b);
                if (sb.length() > 8192) break;
            }
        }
        if (b == -1 && sb.length() == 0) {
            return null;
        }
        return sb.toString();
    }
}
