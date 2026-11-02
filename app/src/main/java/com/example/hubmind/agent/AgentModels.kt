package com.example.hubmind.agent

import java.util.UUID

enum class AndroidActionType {
    TAP,
    DOUBLE_TAP,
    LONG_PRESS,
    SWIPE,
    SCROLL,
    TYPE_TEXT,
    CLEAR_TEXT,
    OPEN_APP,
    GET_INSTALLED_APPS,
    GET_SCREEN_HIERARCHY,
    CAPTURE_SCREEN,
    SET_CLIPBOARD,
    GET_CLIPBOARD,
    NAVIGATE_BACK,
    GO_HOME,
    OPEN_RECENTS,
    OPEN_NOTIFICATIONS,
    OPEN_QUICK_SETTINGS
}

data class AndroidCommand(
    val commandId: String = UUID.randomUUID().toString(),
    val actionType: AndroidActionType,
    val parameters: Map<String, Any> = emptyMap(),
    val targetNodeId: String? = null,
    val expiryTimestamp: Long = System.currentTimeMillis() + 30000,
    val requiresConfirmation: Boolean = false,
    val timestamp: Long = System.currentTimeMillis()
)

data class UiNodeInfo(
    val id: String = "",
    val viewIdResourceName: String? = null,
    val className: String? = null,
    val packageName: String? = null,
    val text: String? = null,
    val contentDescription: String? = null,
    val isClickable: Boolean = false,
    val isEditable: Boolean = false,
    val isScrollable: Boolean = false,
    val boundsInScreen: NodeBounds = NodeBounds(0, 0, 0, 0),
    val children: List<UiNodeInfo> = emptyList()
)

data class NodeBounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int
) {
    val centerX: Int get() = (left + right) / 2
    val centerY: Int get() = (top + bottom) / 2
}

data class AndroidActionResult(
    val commandId: String,
    val actionType: AndroidActionType,
    val success: Boolean,
    val verified: Boolean = false,
    val outputText: String? = null,
    val error: String? = null,
    val hierarchy: UiNodeInfo? = null,
    val installedApps: List<AppInfo>? = null,
    val durationMs: Long = 0,
    val timestamp: Long = System.currentTimeMillis()
)

data class AppInfo(
    val packageName: String,
    val appName: String,
    val isSystemApp: Boolean = false
)
