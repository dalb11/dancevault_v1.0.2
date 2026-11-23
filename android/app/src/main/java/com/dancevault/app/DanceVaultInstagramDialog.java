package com.dancevault.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/**
 * Full-screen dark in-app WebView dialog for playing Instagram Reels directly inside
 * DanceVault without leaving the app or getting blocked by Instagram `/embed/` 403 limits.
 */
public class DanceVaultInstagramDialog {

    public interface OnViewerClosedListener {
        void onClosed(boolean mirrored);
    }

    private final Activity activity;
    private final String reelUrl;
    private final String reelTitle;
    private final OnViewerClosedListener closedListener;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private Dialog dialog;
    private WebView webView;
    private FrameLayout fullscreenOverlay;
    private View customVideoView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private TextView mirrorButton;
    private ProgressBar progressBar;
    private boolean mirrored;
    private boolean callbackInvoked = false;

    public DanceVaultInstagramDialog(
        Activity activity,
        String reelUrl,
        String reelTitle,
        boolean initialMirrored,
        OnViewerClosedListener closedListener
    ) {
        this.activity = activity;
        this.reelUrl = reelUrl;
        this.reelTitle = reelTitle;
        this.mirrored = initialMirrored;
        this.closedListener = closedListener;
    }

    @SuppressLint("SetJavaScriptEnabled")
    public void show() {
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            notifyClosed();
            return;
        }

        dialog = new Dialog(activity, android.R.style.Theme_Black_NoTitleBar) {
            @Override
            protected void onCreate(Bundle savedInstanceState) {
                super.onCreate(savedInstanceState);
                Window window = getWindow();
                if (window != null) {
                    window.setLayout(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    );
                    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                    window.setStatusBarColor(0xFF131313);
                    window.setNavigationBarColor(0xFF131313);
                    WindowCompat.setDecorFitsSystemWindows(window, false);
                    WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(window, window.getDecorView());
                    if (controller != null) {
                        controller.setAppearanceLightStatusBars(false);
                        controller.setAppearanceLightNavigationBars(false);
                    }
                }
            }
        };

        FrameLayout root = new FrameLayout(activity);
        root.setBackgroundColor(0xFF131313);
        root.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        ViewCompat.setOnApplyWindowInsetsListener(root, (v, windowInsets) -> {
            Insets sys = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(sys.left, sys.top, sys.right, sys.bottom);
            return windowInsets;
        });

        LinearLayout column = new LinearLayout(activity);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Top DanceVault Header
        LinearLayout header = new LinearLayout(activity);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(0xFF131313);
        int padH = dp(10);
        header.setPadding(padH, dp(6), padH, dp(6));
        header.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(54)
        ));

        TextView backBtn = createHeaderButton("←", 18);
        backBtn.setContentDescription("Volver a DanceVault");
        backBtn.setOnClickListener(v -> dismissSafely());
        header.addView(backBtn);

        LinearLayout titleBox = new LinearLayout(activity);
        titleBox.setOrientation(LinearLayout.VERTICAL);
        titleBox.setPadding(dp(8), 0, dp(8), 0);
        LinearLayout.LayoutParams titleBoxLp = new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f
        );
        titleBox.setLayoutParams(titleBoxLp);

        TextView titleView = new TextView(activity);
        titleView.setText(reelTitle != null && !reelTitle.trim().isEmpty() ? reelTitle : "Instagram Reel");
        titleView.setTextColor(0xFFE5E2E1);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        titleView.setTypeface(titleView.getTypeface(), android.graphics.Typeface.BOLD);
        titleBox.addView(titleView);

        TextView subView = new TextView(activity);
        subView.setText("Visor integrado · Instagram");
        subView.setTextColor(0xFFC8B6B6);
        subView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        subView.setSingleLine(true);
        titleBox.addView(subView);

        header.addView(titleBox);

        mirrorButton = createPillButton("Espejo");
        updateMirrorButtonAppearance();
        mirrorButton.setOnClickListener(v -> {
            mirrored = !mirrored;
            updateMirrorButtonAppearance();
            applyMirrorCss();
        });
        header.addView(mirrorButton);

        TextView reloadBtn = createHeaderButton("↻", 17);
        reloadBtn.setContentDescription("Recargar Reel");
        LinearLayout.LayoutParams reloadLp = (LinearLayout.LayoutParams) reloadBtn.getLayoutParams();
        reloadLp.leftMargin = dp(4);
        reloadBtn.setLayoutParams(reloadLp);
        reloadBtn.setOnClickListener(v -> {
            if (webView != null) {
                webView.reload();
            }
        });
        header.addView(reloadBtn);

        TextView extBtn = createHeaderButton("↗", 16);
        extBtn.setContentDescription("Abrir fuera");
        LinearLayout.LayoutParams extLp = (LinearLayout.LayoutParams) extBtn.getLayoutParams();
        extLp.leftMargin = dp(4);
        extBtn.setLayoutParams(extLp);
        extBtn.setOnClickListener(v -> openExternally());
        header.addView(extBtn);

        column.addView(header);

        View divider = new View(activity);
        divider.setBackgroundColor(0x14FFFFFF);
        divider.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(1)
        ));
        column.addView(divider);

        progressBar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgress(10);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            progressBar.getProgressDrawable().setColorFilter(
                0xFFFF5261,
                android.graphics.PorterDuff.Mode.SRC_IN
            );
        }
        progressBar.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3)
        ));
        column.addView(progressBar);

        FrameLayout stageHost = new FrameLayout(activity);
        stageHost.setBackgroundColor(Color.BLACK);
        stageHost.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));

        webView = new WebView(activity);
        webView.setBackgroundColor(Color.BLACK);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setSupportMultipleWindows(false);

        String ua = settings.getUserAgentString();
        if (ua != null && ua.contains("; wv")) {
            settings.setUserAgentString(ua.replace("; wv", ""));
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        fullscreenOverlay = new FrameLayout(activity);
        fullscreenOverlay.setBackgroundColor(Color.BLACK);
        fullscreenOverlay.setVisibility(View.GONE);
        fullscreenOverlay.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (progressBar != null) {
                    progressBar.setProgress(newProgress);
                    progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
                }
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customVideoView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customVideoView = view;
                customViewCallback = callback;
                fullscreenOverlay.addView(
                    view,
                    new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                );
                fullscreenOverlay.setVisibility(View.VISIBLE);
                webView.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                exitCustomVideoView();
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request != null ? request.getUrl() : null;
                if (uri == null) return false;
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    return false;
                }
                // Intercept intent:// / instagram:// app hijacks so user stays inside DanceVault
                if ("intent".equals(scheme)) {
                    try {
                        Intent parsed = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                        String fallbackUrl = parsed.getStringExtra("browser_fallback_url");
                        if (fallbackUrl != null && fallbackUrl.startsWith("http")) {
                            view.loadUrl(fallbackUrl);
                        }
                    } catch (Exception ignored) {}
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                applyMirrorCss();
                injectBannerCleaner(url);
                mainHandler.postDelayed(() -> {
                    applyMirrorCss();
                    injectBannerCleaner(url);
                }, 900);
                mainHandler.postDelayed(() -> {
                    applyMirrorCss();
                    injectBannerCleaner(url);
                }, 2200);
            }
        });

        stageHost.addView(webView);
        stageHost.addView(fullscreenOverlay);
        column.addView(stageHost);
        root.addView(column);

        dialog.setContentView(root);
        dialog.setOnKeyListener((d, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                if (customVideoView != null) {
                    exitCustomVideoView();
                    return true;
                }
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return true;
                }
                dismissSafely();
                return true;
            }
            return false;
        });
        dialog.setOnDismissListener(d -> cleanupWebViewAndNotify());

        dialog.show();
        webView.loadUrl(reelUrl);
    }

    private void exitCustomVideoView() {
        if (customVideoView != null && fullscreenOverlay != null) {
            fullscreenOverlay.removeView(customVideoView);
            fullscreenOverlay.setVisibility(View.GONE);
            customVideoView = null;
        }
        if (webView != null) {
            webView.setVisibility(View.VISIBLE);
        }
        if (customViewCallback != null) {
            try {
                customViewCallback.onCustomViewHidden();
            } catch (Exception ignored) {}
            customViewCallback = null;
        }
    }

    private void applyMirrorCss() {
        if (webView == null) return;
        final String js = mirrored
            ? "(function(){var s=document.getElementById('dv-ig-mirror');if(!s){s=document.createElement('style');s.id='dv-ig-mirror';s.textContent='video{transform:scaleX(-1)!important;}';(document.head||document.documentElement).appendChild(s);}})();"
            : "(function(){var s=document.getElementById('dv-ig-mirror');if(s&&s.parentNode){s.parentNode.removeChild(s);}})();";
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(js, null);
            }
        });
    }

    private void injectBannerCleaner(String currentUrl) {
        if (webView == null) return;
        if (currentUrl != null && (currentUrl.contains("/accounts/login") || currentUrl.contains("/challenge"))) {
            return;
        }
        final String js = "(function(){"
            + "try{"
            + "var vids=document.querySelectorAll('video');"
            + "if(vids.length>0){"
            + "document.querySelectorAll('a,button,div').forEach(function(el){"
            + "var txt=(el.innerText||'').trim();"
            + "if((txt==='Usar la app'||txt==='Abrir en la app'||txt==='Use the app'||txt==='Open app'||txt==='Get the Instagram app')&&el.getBoundingClientRect().height<90){"
            + "var box=el.closest('div[style*=\"fixed\"]')||el;"
            + "box.style.display='none';"
            + "}"
            + "});"
            + "}"
            + "}catch(e){}"
            + "})();";
        mainHandler.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(js, null);
            }
        });
    }

    private void openExternally() {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(reelUrl));
            activity.startActivity(intent);
        } catch (Exception ignored) {}
    }

    private void updateMirrorButtonAppearance() {
        if (mirrorButton == null) return;
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(16));
        if (mirrored) {
            bg.setColor(0xFF009EB9);
            mirrorButton.setTextColor(0xFF002F38);
        } else {
            bg.setColor(0xFF201F1F);
            bg.setStroke(dp(1), 0x22FFFFFF);
            mirrorButton.setTextColor(0xFFE5E2E1);
        }
        mirrorButton.setBackground(bg);
    }

    private TextView createHeaderButton(String label, float textSizeSp) {
        TextView btn = new TextView(activity);
        btn.setText(label);
        btn.setTextColor(0xFFE5E2E1);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizeSp);
        btn.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(20));
        bg.setColor(0xFF201F1F);
        btn.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(40), dp(40));
        btn.setLayoutParams(lp);
        return btn;
    }

    private TextView createPillButton(String label) {
        TextView btn = new TextView(activity);
        btn.setText(label);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        btn.setTypeface(btn.getTypeface(), android.graphics.Typeface.BOLD);
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dp(12), 0, dp(12), 0);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            dp(34)
        );
        btn.setLayoutParams(lp);
        return btn;
    }

    private void dismissSafely() {
        if (dialog != null && dialog.isShowing()) {
            try {
                dialog.dismiss();
            } catch (Exception ignored) {
                cleanupWebViewAndNotify();
            }
        } else {
            cleanupWebViewAndNotify();
        }
    }

    private void cleanupWebViewAndNotify() {
        mainHandler.removeCallbacksAndMessages(null);
        exitCustomVideoView();
        try {
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {}
        if (webView != null) {
            try {
                webView.stopLoading();
                webView.loadUrl("about:blank");
                if (webView.getParent() instanceof ViewGroup) {
                    ((ViewGroup) webView.getParent()).removeView(webView);
                }
                webView.removeAllViews();
                webView.destroy();
            } catch (Exception ignored) {}
            webView = null;
        }
        notifyClosed();
    }

    private void notifyClosed() {
        if (callbackInvoked) return;
        callbackInvoked = true;
        if (closedListener != null) {
            closedListener.onClosed(mirrored);
        }
    }

    private int dp(int value) {
        return Math.round(
            TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value,
                activity.getResources().getDisplayMetrics()
            )
        );
    }
}
