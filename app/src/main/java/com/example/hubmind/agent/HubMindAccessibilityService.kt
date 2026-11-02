package com.example.hubmind.agent

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

class HubMindAccessibilityService : AccessibilityService() {

    companion object {
        private var instance: HubMindAccessibilityService? = null
        private const val MAX_HIERARCHY_DEPTH = 24
        private const val MAX_HIERARCHY_NODES = 2500

        val isServiceConnected: Boolean get() = instance != null

        fun getInstance(): HubMindAccessibilityService? = instance
    }

    private class TraversalBudget(var visited: Int = 0)

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // The agent reads the active hierarchy only when a user-authorised action requests it.
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        if (instance == this) instance = null
        super.onDestroy()
    }

    fun dumpActiveHierarchy(): UiNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return parseNode(root, depth = 0, budget = TraversalBudget())
    }

    private fun parseNode(
        node: AccessibilityNodeInfo,
        depth: Int,
        budget: TraversalBudget
    ): UiNodeInfo? {
        if (depth > MAX_HIERARCHY_DEPTH || budget.visited >= MAX_HIERARCHY_NODES) return null
        budget.visited++

        val rect = Rect()
        node.getBoundsInScreen(rect)

        val children = mutableListOf<UiNodeInfo>()
        for (index in 0 until node.childCount) {
            if (budget.visited >= MAX_HIERARCHY_NODES) break
            val child = node.getChild(index) ?: continue
            parseNode(child, depth + 1, budget)?.let(children::add)
        }

        return UiNodeInfo(
            id = node.viewIdResourceName ?: "node_" + node.hashCode(),
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

    suspend fun performTapAt(x: Float, y: Float, durationMs: Long = 100): Boolean {
        val path = Path().apply { moveTo(x, y) }
        return dispatchGestureAwait(path, durationMs)
    }

    suspend fun performSwipe(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        durationMs: Long = 300
    ): Boolean {
        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        return dispatchGestureAwait(path, durationMs)
    }

    private suspend fun dispatchGestureAwait(path: Path, durationMs: Long): Boolean =
        withContext(Dispatchers.Main.immediate) {
            if (Looper.myLooper() != Looper.getMainLooper()) return@withContext false
            suspendCancellableCoroutine { continuation ->
                val gesture = GestureDescription.Builder()
                    .addStroke(
                        GestureDescription.StrokeDescription(
                            path,
                            0,
                            durationMs.coerceIn(1L, 10_000L)
                        )
                    )
                    .build()

                val accepted = dispatchGesture(
                    gesture,
                    object : GestureResultCallback() {
                        override fun onCompleted(gestureDescription: GestureDescription?) {
                            if (continuation.isActive) continuation.resume(true)
                        }

                        override fun onCancelled(gestureDescription: GestureDescription?) {
                            if (continuation.isActive) continuation.resume(false)
                        }
                    },
                    null
                )
                if (!accepted && continuation.isActive) continuation.resume(false)
            }
        }

    fun performTextSetOnFocused(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val focusedNode = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    fun screenWidthPx(): Int = resources.displayMetrics.widthPixels
    fun screenHeightPx(): Int = resources.displayMetrics.heightPixels

}
