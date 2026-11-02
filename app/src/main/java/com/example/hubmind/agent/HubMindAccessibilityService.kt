package com.example.hubmind.agent

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class HubMindAccessibilityService : AccessibilityService() {

    companion object {
        private var instance: HubMindAccessibilityService? = null

        val isServiceConnected: Boolean get() = instance != null

        fun getInstance(): HubMindAccessibilityService? = instance
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Active window event handling for dynamic dumper
    }

    override fun onInterrupt() {
        // Interrupt callback
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
    }

    fun dumpActiveHierarchy(): UiNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return parseNode(root)
    }

    private fun parseNode(node: AccessibilityNodeInfo): UiNodeInfo {
        val rect = Rect()
        node.getBoundsInScreen(rect)

        val children = mutableListOf<UiNodeInfo>()
        for (i in 0 until node.childCount) {
            val child = node.getChild(i)
            if (child != null) {
                children.add(parseNode(child))
            }
        }

        return UiNodeInfo(
            id = node.viewIdResourceName ?: "node_${node.hashCode()}",
            viewIdResourceName = node.viewIdResourceName,
            className = node.className?.toString(),
            packageName = node.packageName?.toString(),
            text = node.text?.toString(),
            contentDescription = node.contentDescription?.toString(),
            isClickable = node.isClickable,
            isEditable = node.isEditable,
            isScrollable = node.isScrollable,
            boundsInScreen = NodeBounds(rect.left, rect.top, rect.right, rect.bottom),
            children = children
        )
    }

    fun performTapAt(x: Float, y: Float, durationMs: Long = 100, onComplete: (Boolean) -> Unit = {}) {
        val path = Path().apply {
            moveTo(x, y)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()

        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                onComplete(true)
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                onComplete(false)
            }
        }, null)
    }

    fun performSwipe(
        startX: Float, startY: Float,
        endX: Float, endY: Float,
        durationMs: Long = 300,
        onComplete: (Boolean) -> Unit = {}
    ) {
        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()

        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                onComplete(true)
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                onComplete(false)
            }
        }, null)
    }

    fun performTextSetOnFocused(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val focus = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return focus.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }
}
