package com.example.hubmind

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.media.projection.MediaProjectionManager
import org.json.JSONObject
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.example.hubmind.agent.AndroidScreenShareEvent
import com.example.hubmind.agent.AndroidScreenShareEvents
import com.example.hubmind.agent.HubMindAgentForegroundService
import com.example.hubmind.agent.HubMindNativeBridge
import com.example.hubmind.di.ServiceLocator
import com.example.hubmind.ui.components.HubMindBottomBar
import com.example.hubmind.ui.components.HubMindNavDestination
import com.example.hubmind.ui.screens.activity.ActivityScreen
import com.example.hubmind.ui.screens.activity.ActivityViewModel
import com.example.hubmind.ui.screens.devices.DevicesScreen
import com.example.hubmind.ui.screens.devices.DevicesViewModel
import com.example.hubmind.ui.screens.settings.SettingsScreen
import com.example.hubmind.ui.screens.settings.SettingsViewModel
import com.example.hubmind.ui.screens.workspace.HubMindWorkspaceWebView
import com.example.hubmind.ui.theme.HubMindTheme
import com.example.hubmind.ui.theme.Slate950

private const val HUBMIND_WORKSPACE_URL = "https://hub-mind.netlify.app/workspace"

/**
 * Android is a first-class Hub-Mind workspace client, not a separate Jess-only app.
 * The authenticated production web workspace is hosted in WebView so documents,
 * inbox, projects, tasks, calendar, Jess chat/voice, settings and Firebase data use
 * the same application and account as desktop and Chrome mobile.
 *
 * The native Compose destinations remain available for phone-specific and cross-device
 * controls which genuinely need Android APIs (accessibility, battery, device status).
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            HubMindTheme {
                val context = LocalContext.current
                var currentTab by remember { mutableStateOf(HubMindNavDestination.WORKSPACE) }
                val pendingWebPermission = remember { mutableStateOf<PermissionRequest?>(null) }
                val pendingFileCallback = remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }

                val audioPermissionLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestPermission()
                ) { granted ->
                    val request = pendingWebPermission.value
                    pendingWebPermission.value = null
                    if (request != null) {
                        if (granted) {
                            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                        } else {
                            request.deny()
                        }
                    }
                }

                val screenCaptureLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.StartActivityForResult()
                ) { result ->
                    val data = result.data
                    if (result.resultCode == Activity.RESULT_OK && data != null) {
                        HubMindAgentForegroundService.startScreenCapture(
                            context,
                            result.resultCode,
                            data
                        )
                    } else {
                        AndroidScreenShareEvents.emit(
                            AndroidScreenShareEvent("error", error = "Screen sharing was cancelled.")
                        )
                    }
                }

                val nativeBridge = remember {
                    HubMindNativeBridge(
                        context = context,
                        requestScreenCapture = {
                            val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
                            if (manager == null) {
                                AndroidScreenShareEvents.emit(
                                    AndroidScreenShareEvent("error", error = "Android screen capture is not available on this device.")
                                )
                            } else {
                                screenCaptureLauncher.launch(manager.createScreenCaptureIntent())
                            }
                        },
                        stopScreenCapture = {
                            HubMindAgentForegroundService.stopScreenCapture(context)
                        },
                        setJessMicrophoneActive = { active ->
                            HubMindAgentForegroundService.setJessMicrophoneActive(context, active)
                        }
                    )
                }

                val fileChooserLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.StartActivityForResult()
                ) { result ->
                    val callback = pendingFileCallback.value
                    pendingFileCallback.value = null
                    if (callback != null) {
                        val data = result.data
                        val uris = when {
                            result.resultCode != Activity.RESULT_OK || data == null -> null
                            data.clipData != null -> Array(data.clipData!!.itemCount) { index ->
                                data.clipData!!.getItemAt(index).uri
                            }
                            data.data != null -> arrayOf(data.data!!)
                            else -> null
                        }
                        callback.onReceiveValue(uris)
                    }
                }

                val webView = remember {
                    WebView(context).apply {
                        setBackgroundColor(android.graphics.Color.rgb(2, 6, 23))
                        overScrollMode = View.OVER_SCROLL_NEVER

                        settings.apply {
                            javaScriptEnabled = true
                            domStorageEnabled = true
                            databaseEnabled = true
                            mediaPlaybackRequiresUserGesture = false
                            allowFileAccess = false
                            allowContentAccess = true
                            cacheMode = WebSettings.LOAD_DEFAULT
                            javaScriptCanOpenWindowsAutomatically = true
                            setSupportMultipleWindows(false)
                            builtInZoomControls = false
                            displayZoomControls = false
                        }

                        addJavascriptInterface(nativeBridge, "HubMindNative")

                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                                val host = runCatching { Uri.parse(url).host?.lowercase() }.getOrNull()
                                if (host == HubMindNativeBridge.WORKSPACE_HOST) {
                                    view?.addJavascriptInterface(nativeBridge, "HubMindNative")
                                } else {
                                    // The token bridge is exposed only on the first-party Hub-Mind
                                    // origin, never on external pages or OAuth provider pages.
                                    view?.removeJavascriptInterface("HubMindNative")
                                }
                                super.onPageStarted(view, url, favicon)
                            }

                            override fun shouldOverrideUrlLoading(
                                view: WebView?,
                                request: WebResourceRequest?
                            ): Boolean {
                                val uri = request?.url ?: return false
                                val host = uri.host?.lowercase()
                                val trustedWorkspace = host == HubMindNativeBridge.WORKSPACE_HOST
                                val trustedAuthHosts = setOf(
                                    "accounts.google.com",
                                    "accounts.googleusercontent.com",
                                    "identitytoolkit.googleapis.com",
                                    "securetoken.googleapis.com",
                                    "www.googleapis.com"
                                )
                                return when (uri.scheme?.lowercase()) {
                                    "mailto", "tel", "sms" -> {
                                        runCatching {
                                            startActivity(Intent(Intent.ACTION_VIEW, uri))
                                        }
                                        true
                                    }
                                    "https" -> {
                                        if (trustedWorkspace || host in trustedAuthHosts) {
                                            false
                                        } else {
                                            runCatching {
                                                startActivity(Intent(Intent.ACTION_VIEW, uri))
                                            }
                                            true
                                        }
                                    }
                                    else -> true
                                }
                            }

                            override fun onReceivedError(
                                view: WebView?,
                                request: WebResourceRequest?,
                                error: WebResourceError?
                            ) {
                                super.onReceivedError(view, request, error)
                                // Sub-resource failures should not replace the whole workspace.
                                // Main-frame recovery remains available through WebView reload.
                            }
                        }

                        webChromeClient = object : WebChromeClient() {
                            override fun onPermissionRequest(request: PermissionRequest) {
                                val requested = request.resources.toList()
                                val audioOnly = requested.isNotEmpty() &&
                                    requested.all { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }

                                runOnUiThread {
                                    if (!audioOnly) {
                                        request.deny()
                                    } else if (
                                        ContextCompat.checkSelfPermission(
                                            context,
                                            Manifest.permission.RECORD_AUDIO
                                        ) == PackageManager.PERMISSION_GRANTED
                                    ) {
                                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                                    } else {
                                        pendingWebPermission.value = request
                                        audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                    }
                                }
                            }

                            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                                if (pendingWebPermission.value === request) {
                                    pendingWebPermission.value = null
                                }
                            }

                            override fun onShowFileChooser(
                                webView: WebView?,
                                filePathCallback: ValueCallback<Array<Uri>>?,
                                fileChooserParams: FileChooserParams?
                            ): Boolean {
                                pendingFileCallback.value?.onReceiveValue(null)
                                pendingFileCallback.value = filePathCallback
                                return try {
                                    val pickerIntent = fileChooserParams?.createIntent()
                                        ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                                            addCategory(Intent.CATEGORY_OPENABLE)
                                            type = "*/*"
                                        }
                                    fileChooserLauncher.launch(pickerIntent)
                                    true
                                } catch (_: Exception) {
                                    pendingFileCallback.value = null
                                    filePathCallback?.onReceiveValue(null)
                                    false
                                }
                            }
                        }

                        loadUrl(HUBMIND_WORKSPACE_URL)
                    }
                }

                DisposableEffect(webView) {
                    onDispose {
                        pendingFileCallback.value?.onReceiveValue(null)
                        pendingFileCallback.value = null
                        pendingWebPermission.value?.deny()
                        pendingWebPermission.value = null
                        webView.stopLoading()
                        webView.destroy()
                        nativeBridge.close()
                    }
                }

                LaunchedEffect(webView) {
                    AndroidScreenShareEvents.events.collect { event ->
                        val payload = JSONObject()
                            .put("type", event.type)
                            .put("dataUrl", event.dataUrl)
                            .put("error", event.error)
                        val script = "window.dispatchEvent(new CustomEvent('hubmind-native-screen-share',{detail:$payload}));"
                        webView.post { webView.evaluateJavascript(script, null) }
                    }
                }

                val devicesViewModel = remember {
                    DevicesViewModel(
                        deviceRegistryRepository = ServiceLocator.deviceRegistryRepository
                    )
                }
                val activityViewModel = remember {
                    ActivityViewModel(
                        deviceControlRepository = ServiceLocator.deviceControlRepository
                    )
                }
                val settingsViewModel = remember {
                    SettingsViewModel(
                        authRepository = ServiceLocator.authRepository,
                        permissionStatusRepository = ServiceLocator.permissionStatusRepository,
                        androidAgentController = ServiceLocator.androidAgentController,
                        jessRepository = ServiceLocator.jessRepository,
                        context = applicationContext
                    )
                }

                // Keep native Devices selection and the shared Jess workspace selector
                // on the same per-account active target.
                LaunchedEffect(devicesViewModel, webView) {
                    var lastTargetId: String? = null
                    devicesViewModel.uiState.collect { state ->
                        val targetId = state.currentTargetDevice?.deviceId ?: return@collect
                        if (targetId == lastTargetId) return@collect
                        lastTargetId = targetId
                        val quoted = JSONObject.quote(targetId)
                        val script = "localStorage.setItem('hubmind.jess.activeTargetDeviceId.v1',$quoted);" +
                            "window.dispatchEvent(new Event('hubmind-target-device-changed'));"
                        webView.post { webView.evaluateJavascript(script, null) }
                    }
                }

                BackHandler {
                    when {
                        currentTab != HubMindNavDestination.WORKSPACE -> {
                            currentTab = HubMindNavDestination.WORKSPACE
                        }
                        webView.canGoBack() -> webView.goBack()
                        else -> finish()
                    }
                }

                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    containerColor = Slate950,
                    bottomBar = {
                        HubMindBottomBar(
                            currentDestination = currentTab,
                            onNavigate = { currentTab = it }
                        )
                    }
                ) { innerPadding ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                    ) {
                        // Remains attached while hidden to preserve live document edits,
                        // authentication state, scroll position and ongoing Jess sessions.
                        HubMindWorkspaceWebView(
                            webView = webView,
                            visible = currentTab == HubMindNavDestination.WORKSPACE,
                            modifier = Modifier.fillMaxSize()
                        )

                        when (currentTab) {
                            HubMindNavDestination.WORKSPACE -> Unit
                            HubMindNavDestination.DEVICES -> DevicesScreen(viewModel = devicesViewModel)
                            HubMindNavDestination.ACTIVITY -> ActivityScreen(viewModel = activityViewModel)
                            HubMindNavDestination.SETTINGS -> SettingsScreen(
                                viewModel = settingsViewModel,
                                // Authentication belongs to the shared Firebase workspace.
                                // Open its sign-in route rather than signing out a mock native user.
                                onSignOut = {
                                    webView.evaluateJavascript(
                                        "window.dispatchEvent(new Event('hubmind-native-signout'));",
                                        null
                                    )
                                    webView.loadUrl("https://hub-mind.netlify.app/login")
                                    currentTab = HubMindNavDestination.WORKSPACE
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
