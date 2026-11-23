package com.dancevault.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DanceVaultMediaPlugin.class);
        super.onCreate(savedInstanceState);
        if (this.bridge != null) {
            this.bridge.setWebViewClient(new DanceVaultWebViewClient(this.bridge));
            WebView webView = this.bridge.getWebView();
            if (webView != null) {
                CookieManager cookieManager = CookieManager.getInstance();
                cookieManager.setAcceptCookie(true);
                cookieManager.setAcceptThirdPartyCookies(webView, true);
                WebSettings settings = webView.getSettings();
                settings.setDomStorageEnabled(true);
                settings.setMediaPlaybackRequiresUserGesture(false);
            }
        }
    }
}
