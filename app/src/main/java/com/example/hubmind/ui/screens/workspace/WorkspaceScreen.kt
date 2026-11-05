@file:Suppress("SetJavaScriptEnabled")

package com.example.hubmind.ui.screens.workspace

import android.Manifest
import android.app.Dialog
import android.content.Intent
import android.net.Uri
import android.os.Message
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import com.example.hubmind.data.session.HubMindNativeSessionStore
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import android.webkit.WebChromeClient.FileChooserParams
import com.example.hubmind.ui.theme.Slate900
import com.example.hubmind.ui.theme.Slate950
import com.example.hubmind.ui.theme.Teal400

private const val HUBMIND_HOST = "hub-mind.netlify.app"
private const val HUBMIND_WORKSPACE_URL = "https://hub-mind.netlify.app/workspace"

/**
 * Hosts the real Hub-Mind responsive web application inside the Android app.
 * The web application remains the source of truth for workspace navigation,
 * Firebase authentication, documents, inbox, tasks, projects, Jess chat and
 * Jess Live voice. Native Android screens remain available for OS-level tools.
 */
@Composable
fun WorkspaceScreen(
    modifier: Modifier = Modifier,
    isVisible: Boolean,
    onOpenDeviceControls: () -> Unit
) {
    val context = LocalContext.current
    var pageProgress by remember { mutableIntStateOf(0) }
    var canGoBack by remember { mutableStateOf(false) }
    var pendingMicPermission by remember { mutableStateOf<PermissionRequest?>(null) }
    var pendingFileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        val request = pendingMicPermission
        pendingMicPermission = null
        if (request != null) {
            if (granted) {
                request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            } else {
                request.deny()
            }
        }
    }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments()
    ) { selectedUris ->
        pendingFileCallback?.onReceiveValue(selectedUris.toTypedArray())
        pendingFileCallback = null
    }

    val webView = remember {
        WebView(context).apply {
            setBackgroundColor(android.graphics.Color.rgb(2, 6, 23))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                loadsImagesAutomatically = true
                allowFileAccess = false
                allowContentAccess = true
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                javaScriptCanOpenWindowsAutomatically = true
                setSupportMultipleWindows(true)
                builtInZoomControls = false
                displayZoomControls = false
            }
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    val uri = request?.url ?: return false
                    if (uri.scheme == "https" && uri.host.equals(HUBMIND_HOST, ignoreCase = true)) {
                        return false
                    }

                    // Keep the workspace origin inside the app. Open unrelated
                    // links in the device browser; never allow clear-text HTTP.
                    return try {
                        if (uri.scheme == "https" || uri.scheme == "mailto" || uri.scheme == "tel") {
                            context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                        }
                        true
                    } catch (_: Exception) {
                        true
                    }
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    pageProgress = 0
                    canGoBack = view?.canGoBack() == true
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    pageProgress = 100
                    canGoBack = view?.canGoBack() == true
                }

                override fun onReceivedSslError(
                    view: WebView?,
                    handler: SslErrorHandler?,
                    error: android.net.http.SslError?
                ) {
                    // Never bypass certificate validation inside the workspace.
                    handler?.cancel()
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    pageProgress = newProgress
                    canGoBack = view?.canGoBack() == true
                }

                override fun onPermissionRequest(request: PermissionRequest) {
                    val origin = request.origin
                    val isTrustedOrigin =
                        origin.scheme.equals("https", ignoreCase = true) &&
                        origin.host.equals(HUBMIND_HOST, ignoreCase = true)
                    val onlyAudioRequested = request.resources.isNotEmpty() &&
                        request.resources.all { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }

                    if (!isTrustedOrigin || !onlyAudioRequested) {
                        request.deny()
                        return
                    }

                    if (ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.RECORD_AUDIO
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        pendingMicPermission?.deny()
                        pendingMicPermission = request
                        micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }

                override fun onShowFileChooser(
                    view: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    pendingFileCallback?.onReceiveValue(null)
                    pendingFileCallback = filePathCallback
                    val acceptedTypes = fileChooserParams?.acceptTypes
                        ?.flatMap { it.split(",") }
                        ?.map { it.trim() }
                        ?.filter { it.contains("/") }
                        ?.distinct()
                        ?.ifEmpty { listOf("*/*") }
                        ?.toTypedArray()
                        ?: arrayOf("*/*")

                    return try {
                        filePickerLauncher.launch(acceptedTypes)
                        true
                    } catch (_: Exception) {
                        pendingFileCallback?.onReceiveValue(null)
                        pendingFileCallback = null
                        false
                    }
                }

                override fun onCreateWindow(
                    view: WebView?,
                    isDialog: Boolean,
                    isUserGesture: Boolean,
                    resultMsg: Message?
                ): Boolean {
                    // Firebase Google sign-in uses a popup window. Keep that
                    // popup in a temporary WebView so the web app can complete
                    // its existing postMessage-based auth handshake.
                    val message = resultMsg ?: return false
                    val popup = WebView(context).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.databaseEnabled = true
                        webViewClient = WebViewClient()
                    }
                    val popupDialog = Dialog(context)
                    popupDialog.setContentView(popup)
                    popupDialog.setOnDismissListener {
                        popup.stopLoading()
                        (popup.parent as? ViewGroup)?.removeView(popup)
                        popup.destroy()
                    }

                    val transport = message.obj as? WebView.WebViewTransport ?: run {
                        popup.destroy()
                        return false
                    }
                    transport.webView = popup
                    message.sendToTarget()
                    popupDialog.show()
                    popupDialog.window?.setLayout(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    popup.webChromeClient = object : WebChromeClient() {
                        override fun onCloseWindow(window: WebView?) {
                            popupDialog.dismiss()
                        }
                    }
                    return true
                }
            }

            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                WebViewCompat.addWebMessageListener(
                    this,
                    "HubMindAndroid",
                    setOf("https://$HUBMIND_HOST")
                ) { _, message, sourceOrigin, isMainFrame, _ ->
                    if (!isMainFrame || !sourceOrigin.scheme.equals("https", ignoreCase = true) ||
                        !sourceOrigin.host.equals(HUBMIND_HOST, ignoreCase = true)
                    ) return@addWebMessageListener

                    runCatching {
                        val payload = JSONObject(message.data ?: return@runCatching)
                        when (payload.optString("type")) {
                            "session" -> HubMindNativeSessionStore.update(
                                payload.optString("userId"),
                                payload.optString("idToken")
                            )
                            "clear" -> HubMindNativeSessionStore.clear()
                        }
                    }.onFailure {
                        android.util.Log.w("HubMindWorkspace", "Ignored invalid native session message.")
                    }
                }
            }

            loadUrl(HUBMIND_WORKSPACE_URL)
        }
    }

    DisposableEffect(webView) {
        onDispose {
            pendingMicPermission?.deny()
            pendingFileCallback?.onReceiveValue(null)
            webView.stopLoading()
            webView.destroy()
        }
    }

    BackHandler(enabled = isVisible && canGoBack) {
        webView.goBack()
        canGoBack = webView.canGoBack()
    }

    Box(modifier = modifier.fillMaxSize()) {
        AndroidView(
            factory = { webView },
            modifier = Modifier.fillMaxSize()
        )

        if (pageProgress in 1..99) {
            LinearProgressIndicator(
                progress = pageProgress / 100f,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 1.dp),
                color = Teal400,
                trackColor = Slate900
            )
        }

        if (isVisible) {
            IconButton(
                onClick = onOpenDeviceControls,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(10.dp)
                    .size(44.dp)
            ) {
                Surface(
                    shape = CircleShape,
                    color = Slate950.copy(alpha = 0.88f),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.16f))
                ) {
                    Icon(
                        imageVector = Icons.Filled.Devices,
                        contentDescription = "Open Android and connected-device controls",
                        tint = Teal400,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }
        }
    }
}
