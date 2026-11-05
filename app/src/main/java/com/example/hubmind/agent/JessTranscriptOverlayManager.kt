package com.example.hubmind.agent

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Lightweight, non-interactive Android caption overlay for Jess.
 *
 * The WindowManager flags deliberately make the surface non-focusable and
 * non-touchable, so taps, swipes and typing continue to reach the app underneath.
 */
class JessTranscriptOverlayManager(context: Context) {
    private val appContext = context.applicationContext
    private val windowManager = appContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private var root: LinearLayout? = null
    private var speakerLabel: TextView? = null
    private var caption: TextView? = null
    private var hideRunnable: Runnable? = null
    private var attached = false

    val hasPermission: Boolean
        get() = Settings.canDrawOverlays(appContext)

    fun show(speaker: String, text: String) {
        val safeText = text.trim().take(MAX_CAPTION_CHARS)
        if (safeText.isEmpty() || !hasPermission) return
        mainHandler.post {
            try {
                ensureAttached()
                speakerLabel?.text = if (speaker.equals("user", true)) "YOU" else "JESS"
                caption?.text = safeText
                root?.visibility = View.VISIBLE
                hideRunnable?.let(mainHandler::removeCallbacks)
                val next = Runnable { hide() }
                hideRunnable = next
                mainHandler.postDelayed(next, HIDE_AFTER_MS)
            } catch (_: Exception) {
                // Transcript display is supplemental and must never interrupt Jess audio.
            }
        }
    }

    fun hide() {
        mainHandler.post {
            hideRunnable?.let(mainHandler::removeCallbacks)
            hideRunnable = null
            root?.visibility = View.GONE
        }
    }

    fun close() {
        mainHandler.post {
            hideRunnable?.let(mainHandler::removeCallbacks)
            hideRunnable = null
            root?.let { view ->
                if (attached) runCatching { windowManager.removeView(view) }
            }
            attached = false
            root = null
            speakerLabel = null
            caption = null
        }
    }

    private fun ensureAttached() {
        if (attached && root != null) return
        if (!hasPermission) return

        val panel = LinearLayout(appContext).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(14), dp(6), dp(14), dp(7))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(11).toFloat()
                setColor(Color.argb(17, 2, 6, 23))
                setStroke(dp(1), Color.argb(18, 226, 232, 240))
            }
            elevation = 0f
            isClickable = false
            isFocusable = false
        }

        val label = TextView(appContext).apply {
            text = "JESS"
            setTextColor(Color.rgb(153, 246, 228))
            textSize = 9f
            letterSpacing = .14f
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
            gravity = Gravity.CENTER
            setShadowLayer(dp(3).toFloat(), 0f, dp(1).toFloat(), Color.BLACK)
        }
        val text = TextView(appContext).apply {
            setTextColor(Color.WHITE)
            textSize = 15f
            typeface = Typeface.create("sans-serif", Typeface.NORMAL)
            gravity = Gravity.CENTER
            maxLines = 3
            setPadding(0, dp(2), 0, 0)
            setShadowLayer(dp(3).toFloat(), 0f, dp(1).toFloat(), Color.BLACK)
        }
        panel.addView(label, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))
        panel.addView(text, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = dp(26)
            horizontalMargin = .04f
            verticalMargin = 0f
            title = "Hub-Mind Jess Transcript"
        }

        windowManager.addView(panel, params)
        root = panel
        speakerLabel = label
        caption = text
        attached = true
    }

    private fun dp(value: Int): Int =
        (value * appContext.resources.displayMetrics.density).toInt()

    companion object {
        private const val MAX_CAPTION_CHARS = 12000
        private const val HIDE_AFTER_MS = 8500L
    }
}
