package com.example.hubmind

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.UUID

class HubMindWebViewActivity : ComponentActivity() {
    companion object {
        private const val HUBMIND_URL = "https://hub-mind.netlify.app/"
        private val TRUSTED_HOSTS = setOf("hub-mind.netlify.app", "hub-mind.web.app")
    }

    private lateinit var webView: WebView
    private val bridgeToken = UUID.randomUUID().toString()
    private var pendingWebPermission: PermissionRequest? = null

    private val requestMicrophone = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val request = pendingWebPermission
        pendingWebPermission = null
        if (granted && request != null) {
            runCatching { request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) }
        } else {
            runCatching { request?.deny() }
            Toast.makeText(this, "Microphone access is required for Jess voice conversations.", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        webView.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        setContentView(FrameLayout(this).apply { addView(webView) })

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
        }

        webView.addJavascriptInterface(AndroidNativeBridge(this, webView, bridgeToken), "HubMindAndroidBridge")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return true
                val host = uri.host?.lowercase().orEmpty()
                if (uri.scheme == "https" && host in TRUSTED_HOSTS) return false
                if (uri.scheme == "http" || uri.scheme == "https" || uri.scheme == "mailto" || uri.scheme == "tel") {
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        true
                    } catch (_: Exception) {
                        true
                    }
                }
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val host = runCatching { Uri.parse(url).host?.lowercase() }.getOrNull()
                if (host in TRUSTED_HOSTS) {
                    val token = JSONObject.quote(bridgeToken)
                    view?.evaluateJavascript("window.__HUBMIND_NATIVE_TOKEN__ = $token;", null)
                }
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: android.webkit.WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    Toast.makeText(this@HubMindWebViewActivity, "Hub-Mind could not load. Check your internet connection and retry.", Toast.LENGTH_LONG).show()
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val audioRequested = request.resources?.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) == true
                    val onlyAudio = request.resources?.all { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE } == true
                    if (!audioRequested || !onlyAudio) {
                        request.deny()
                        return@runOnUiThread
                    }
                    if (ContextCompat.checkSelfPermission(this@HubMindWebViewActivity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        pendingWebPermission = request
                        requestMicrophone.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest?) {
                if (pendingWebPermission === request) pendingWebPermission = null
                super.onPermissionRequestCanceled(request)
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(HUBMIND_URL)
            showAccessibilitySetupPromptIfNeeded()
        }
    }


    private fun showAccessibilitySetupPromptIfNeeded() {
        val prefs = getSharedPreferences("hubmind_native", MODE_PRIVATE)
        if (prefs.getBoolean("accessibility_prompt_shown", false) || isAccessibilityServiceEnabled()) return
        prefs.edit().putBoolean("accessibility_prompt_shown", true).apply()
        AlertDialog.Builder(this)
            .setTitle("Enable Jess phone controls")
            .setMessage("To let Jess interact with apps on this phone, Android requires you to enable Hub-Mind Accessibility manually. This permission can expose the active screen's visible UI and perform taps, swipes and text entry when you explicitly ask. You can revoke it at any time in Android Settings. It does not let Jess bypass your PIN, biometrics or protected screens.")
            .setPositiveButton("Open accessibility settings") { _, _ ->
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
            .setNegativeButton("Not now", null)
            .show()
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val expected = android.content.ComponentName(this, com.example.hubmind.agent.HubMindAccessibilityService::class.java).flattenToString()
        return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::webView.isInitialized) webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
    }

    override fun onPause() {
        if (::webView.isInitialized) webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        pendingWebPermission?.let { runCatching { it.deny() } }
        pendingWebPermission = null
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.removeJavascriptInterface("HubMindAndroidBridge")
            webView.destroy()
        }
        super.onDestroy()
    }
}
