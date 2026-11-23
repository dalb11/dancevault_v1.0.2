package com.dancevault.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Zero-copy, non-destructive Android SAF & Photo Picker media bridge.
 *
 * Sacred DanceVault guarantees:
 * 1. NEVER duplicates or copies user videos into private app storage.
 * 2. NEVER modifies, moves, or deletes the original video file on the device.
 * 3. Holds ONLY a read-only URI permission to the original file and streams
 *    on demand over a private 127.0.0.1 loopback socket in RAM.
 */
@CapacitorPlugin(name = "DanceVaultMedia")
public class DanceVaultMediaPlugin extends Plugin {

    private final ExecutorService metadataExecutor = Executors.newSingleThreadExecutor();
    private DanceVaultMediaServer mediaServer;

    @Override
    public void load() {
        super.load();
        ensureMediaServerStarted();
    }

    private synchronized void ensureMediaServerStarted() {
        if (mediaServer == null) {
            mediaServer = new DanceVaultMediaServer(getContext());
        }
        try {
            mediaServer.ensureStarted();
        } catch (IOException ignored) {
            // Fallback route /_dv_media remains registered if loopback socket fails
        }
    }

    private String buildPlayableUrl(String contentUri) {
        ensureMediaServerStarted();
        if (mediaServer != null && mediaServer.getPort() > 0) {
            String url = mediaServer.buildMediaUrl(contentUri);
            if (!url.isEmpty()) {
                return url;
            }
        }
        return "";
    }

    @PluginMethod
    public void getMediaServerInfo(PluginCall call) {
        ensureMediaServerStarted();
        JSObject res = new JSObject();
        res.put("port", mediaServer != null ? mediaServer.getPort() : -1);
        res.put("token", mediaServer != null ? mediaServer.getToken() : "");
        res.put("baseUrl", mediaServer != null ? mediaServer.getBaseUrl() : "");
        call.resolve(res);
    }

    @PluginMethod
    public void pickVideo(PluginCall call) {
        String mode = call.getString("mode", "gallery");
        Intent intent;

        if ("files".equalsIgnoreCase(mode)) {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("video/*");
            intent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION |
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            );
        } else {
            PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
                .setMediaType(ActivityResultContracts.PickVisualMedia.VideoOnly.INSTANCE)
                .build();
            intent = new ActivityResultContracts.PickVisualMedia().createIntent(getContext(), request);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }

        startActivityForResult(call, intent, "handlePickVideoResult");
    }

    @ActivityCallback
    private void handlePickVideoResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject cancelledResult = new JSObject();
            cancelledResult.put("cancelled", true);
            call.resolve(cancelledResult);
            return;
        }

        Uri uri = data.getData();
        ContentResolver resolver = getContext().getContentResolver();

        int takeFlags = data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
        if (takeFlags == 0) {
            takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
        }
        try {
            resolver.takePersistableUriPermission(uri, takeFlags);
        } catch (SecurityException ignored) {
            // Older Android Photo Picker providers may deny persistable flag while still granting session access
        }

        metadataExecutor.execute(() -> {
            String fileName = queryDisplayName(resolver, uri);
            long sizeBytes = queryFileSize(resolver, uri);
            String mimeType = resolver.getType(uri);
            if (mimeType == null || mimeType.isEmpty()) {
                mimeType = "video/mp4";
            }

            double durationSec = 0;
            int width = 0;
            int height = 0;

            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                retriever.setDataSource(getContext(), uri);
                String durStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                String wStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
                String hStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
                if (durStr != null) {
                    durationSec = Math.max(0, Long.parseLong(durStr) / 1000.0);
                }
                if (wStr != null) {
                    width = Integer.parseInt(wStr);
                }
                if (hStr != null) {
                    height = Integer.parseInt(hStr);
                }
            } catch (Exception ignored) {
                // HTML5 <video> probe also extracts metadata cleanly as fallback
            } finally {
                try {
                    retriever.release();
                } catch (Exception ignored) {}
            }

            String playableUrl = buildPlayableUrl(uri.toString());

            JSObject res = new JSObject();
            res.put("cancelled", false);
            res.put("uri", uri.toString());
            res.put("playableUrl", playableUrl);
            res.put("fileName", fileName);
            res.put("sizeBytes", sizeBytes);
            res.put("mimeType", mimeType);
            res.put("durationSec", durationSec);
            res.put("width", width);
            res.put("height", height);
            call.resolve(res);
        });
    }

    @PluginMethod
    public void checkUriAccessible(PluginCall call) {
        String rawUri = call.getString("uri");
        JSObject res = new JSObject();
        if (rawUri == null || rawUri.trim().isEmpty()) {
            res.put("accessible", false);
            call.resolve(res);
            return;
        }

        String trimmedUri = rawUri.trim();
        try {
            Uri uri = Uri.parse(trimmedUri);
            try (AssetFileDescriptor afd = getContext().getContentResolver().openAssetFileDescriptor(uri, "r")) {
                boolean ok = afd != null;
                res.put("accessible", ok);
                if (ok) {
                    res.put("playableUrl", buildPlayableUrl(trimmedUri));
                }
            }
        } catch (Exception e) {
            res.put("accessible", false);
        }
        call.resolve(res);
    }

    /**
     * Releases ONLY DanceVault's read-permission token for an unused URI.
     * NEVER touches or deletes the user's original file.
     */
    @PluginMethod
    public void releaseUriPermission(PluginCall call) {
        String rawUri = call.getString("uri");
        if (rawUri != null && !rawUri.trim().isEmpty()) {
            try {
                Uri uri = Uri.parse(rawUri.trim());
                getContext().getContentResolver().releasePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
            } catch (Exception ignored) {
                // Safe no-op if already released or provider was non-persistable
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void shareVideo(PluginCall call) {
        String rawUri = call.getString("uri");
        String title = call.getString("title", "Compartir vídeo");
        String mimeType = call.getString("mimeType", "video/*");

        if (rawUri == null || rawUri.trim().isEmpty()) {
            call.reject("URI_UNAVAILABLE");
            return;
        }

        Uri contentUri = Uri.parse(rawUri.trim());
        try (AssetFileDescriptor afd = getContext().getContentResolver().openAssetFileDescriptor(contentUri, "r")) {
            if (afd == null) {
                call.reject("URI_UNAVAILABLE");
                return;
            }
        } catch (Exception e) {
            call.reject("URI_UNAVAILABLE");
            return;
        }

        String resolvedMime = getContext().getContentResolver().getType(contentUri);
        if (resolvedMime == null || resolvedMime.isEmpty()) {
            resolvedMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "video/mp4";
        }

        Intent sendIntent = new Intent(Intent.ACTION_SEND);
        sendIntent.setType(resolvedMime);
        sendIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
        sendIntent.putExtra(Intent.EXTRA_SUBJECT, title);
        sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        Intent chooser = Intent.createChooser(sendIntent, title);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, chooser, "handleShareVideoResult");
    }

    @ActivityCallback
    private void handleShareVideoResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject res = new JSObject();
        res.put("shared", true);
        call.resolve(res);
    }

    @PluginMethod
    public void fetchInstagramMetadata(PluginCall call) {
        String rawUrl = call.getString("url", "").trim();
        if (rawUrl.isEmpty() || (!rawUrl.startsWith("https://") && !rawUrl.startsWith("http://"))) {
            JSObject empty = new JSObject();
            empty.put("ok", false);
            call.resolve(empty);
            return;
        }

        metadataExecutor.execute(() -> {
            JSObject res = new JSObject();
            res.put("ok", false);
            HttpURLConnection conn = null;
            try {
                URL target = new URL(rawUrl);
                conn = (HttpURLConnection) target.openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4500);
                conn.setRequestProperty("User-Agent", "facebookexternalhit/1.1");
                conn.setRequestProperty("Accept-Language", "es-ES,es;q=0.9,en;q=0.8");

                int status = conn.getResponseCode();
                if (status >= 200 && status < 400) {
                    StringBuilder html = new StringBuilder();
                    try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
                    )) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            html.append(line).append('\n');
                            if (html.length() > 120_000) break;
                        }
                    }

                    String body = html.toString();
                    String ogTitle = extractMetaContent(body, "og:title");
                    String ogImage = extractMetaContent(body, "og:image");
                    String ogUrl = extractMetaContent(body, "og:url");

                    String cleanTitle = formatInstagramTitle(ogTitle);
                    if (!cleanTitle.isEmpty() || !ogImage.isEmpty()) {
                        res.put("ok", true);
                        if (!cleanTitle.isEmpty()) res.put("title", cleanTitle);
                        if (!ogImage.isEmpty()) res.put("coverUrl", ogImage);
                        if (!ogUrl.isEmpty()) res.put("canonicalUrl", ogUrl);
                    }
                }
            } catch (Exception ignored) {
                // Best-effort metadata enrichment; failure falls back cleanly
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
            call.resolve(res);
        });
    }

    @PluginMethod
    public void openInstagramViewer(PluginCall call) {
        String rawUrl = call.getString("url", "").trim();
        String title = call.getString("title", "Instagram Reel");
        boolean mirrored = Boolean.TRUE.equals(call.getBoolean("mirrored", false));

        if (rawUrl.isEmpty() || (!rawUrl.startsWith("https://") && !rawUrl.startsWith("http://"))) {
            call.reject("URL_UNAVAILABLE");
            return;
        }

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("ACTIVITY_UNAVAILABLE");
            return;
        }

        activity.runOnUiThread(() -> {
            DanceVaultInstagramDialog viewer = new DanceVaultInstagramDialog(
                activity,
                rawUrl,
                title,
                mirrored,
                finalMirrored -> {
                    JSObject res = new JSObject();
                    res.put("closed", true);
                    res.put("mirrored", finalMirrored);
                    call.resolve(res);
                }
            );
            viewer.show();
        });
    }

    private static String extractMetaContent(String html, String propertyName) {
        if (html == null || html.isEmpty()) return "";
        String escapedProp = Pattern.quote(propertyName);
        Pattern p1 = Pattern.compile(
            "<meta[^>]+property=[\"']" + escapedProp + "[\"'][^>]+content=[\"']([^\"']*)[\"']",
            Pattern.CASE_INSENSITIVE
        );
        Matcher m1 = p1.matcher(html);
        if (m1.find()) {
            return unescapeHtmlEntities(m1.group(1));
        }
        Pattern p2 = Pattern.compile(
            "<meta[^>]+content=[\"']([^\"']*)[\"'][^>]+property=[\"']" + escapedProp + "[\"']",
            Pattern.CASE_INSENSITIVE
        );
        Matcher m2 = p2.matcher(html);
        if (m2.find()) {
            return unescapeHtmlEntities(m2.group(1));
        }
        return "";
    }

    private static String unescapeHtmlEntities(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        String out = raw
            .replace("&amp;", "&")
            .replace("&quot;", "\"")
            .replace("&#039;", "'")
            .replace("&#x27;", "'")
            .replace("&#x2F;", "/")
            .replace("&lt;", "<")
            .replace("&gt;", ">");
        return out.trim();
    }

    private static String formatInstagramTitle(String ogTitle) {
        if (ogTitle == null || ogTitle.trim().isEmpty()) return "";
        String s = ogTitle.trim();
        int marker = s.indexOf(" on Instagram:");
        if (marker > 0) {
            String author = s.substring(0, marker).trim();
            String rest = s.substring(marker + " on Instagram:".length()).trim();
            rest = rest.replaceAll("^\"+|\"+$", "").trim();
            s = rest.isEmpty() ? author : (author + " · " + rest);
        }
        if (s.length() > 60) {
            s = s.substring(0, 59).trim() + "…";
        }
        return s;
    }

    @Override
    protected void handleOnDestroy() {
        metadataExecutor.shutdownNow();
        if (mediaServer != null) {
            mediaServer.shutdown();
            mediaServer = null;
        }
        super.handleOnDestroy();
    }

    private String queryDisplayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = cursor.getString(idx);
                    if (name != null && !name.trim().isEmpty()) {
                        return name.trim();
                    }
                }
            }
        } catch (Exception ignored) {}

        String segment = uri.getLastPathSegment();
        if (segment != null && !segment.trim().isEmpty()) {
            int colonIdx = segment.lastIndexOf(':');
            String clean = colonIdx >= 0 ? segment.substring(colonIdx + 1) : segment;
            int slashIdx = clean.lastIndexOf('/');
            clean = slashIdx >= 0 ? clean.substring(slashIdx + 1) : clean;
            if (!clean.isEmpty()) return clean;
        }
        return "video.mp4";
    }

    private long queryFileSize(ContentResolver resolver, Uri uri) {
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
            if (afd != null) {
                long len = afd.getLength();
                if (len > 0) return len;
                if (afd.getParcelFileDescriptor() != null) {
                    long stat = afd.getParcelFileDescriptor().getStatSize();
                    if (stat > 0) return stat;
                }
            }
        } catch (IOException ignored) {}

        return 0;
    }
}
