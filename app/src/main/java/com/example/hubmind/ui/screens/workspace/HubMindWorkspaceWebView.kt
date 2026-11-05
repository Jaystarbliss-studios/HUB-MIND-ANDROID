package com.example.hubmind.ui.screens.workspace

import android.view.View
import android.webkit.WebView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Hosts the same authenticated Hub-Mind web workspace used by desktop and mobile browsers.
 *
 * Keep the WebView attached while native device/settings screens are shown so an open
 * document, editor selection, scroll position, Firebase session and Jess Live session
 * are not discarded when the user switches tabs.
 */
@Composable
fun HubMindWorkspaceWebView(
    webView: WebView,
    visible: Boolean,
    modifier: Modifier = Modifier
) {
    SideEffect {
        webView.visibility = if (visible) View.VISIBLE else View.INVISIBLE
        webView.isFocusable = visible
        webView.isFocusableInTouchMode = visible
    }

    AndroidView(
        factory = { webView },
        modifier = modifier,
        update = {
            it.visibility = if (visible) View.VISIBLE else View.INVISIBLE
        }
    )
}
