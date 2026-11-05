package com.example.hubmind.agent

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import android.util.DisplayMetrics
import android.view.WindowManager
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

data class AndroidScreenShareEvent(
    val type: String,
    val dataUrl: String? = null,
    val error: String? = null
)

/** Process-local event pipe from the foreground MediaProjection service to the WebView. */
object AndroidScreenShareEvents {
    private val mutableEvents = MutableSharedFlow<AndroidScreenShareEvent>(
        replay = 0,
        extraBufferCapacity = 1
    )
    val events: SharedFlow<AndroidScreenShareEvent> = mutableEvents

    fun emit(event: AndroidScreenShareEvent) {
        mutableEvents.tryEmit(event)
    }
}

/**
 * Owns one user-consented MediaProjection session and converts the virtual display
 * into bounded JPEG frames for Jess Live. Android 14+ grants are single-use: this
 * class accepts one result Intent and creates exactly one VirtualDisplay for it.
 */
class AndroidScreenCaptureManager(
    private val context: Context
) {
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var workerThread: HandlerThread? = null
    private var workerHandler: Handler? = null
    private val stopping = AtomicBoolean(false)
    private var lastFrameAt = 0L

    val isCaptureActive: Boolean get() = mediaProjection != null && virtualDisplay != null

    fun start(resultCode: Int, resultData: Intent) {
        if (isCaptureActive) {
            AndroidScreenShareEvents.emit(AndroidScreenShareEvent("error", error = "Screen sharing is already active."))
            return
        }
        stopInternal(stopProjection = true)

        try {
            val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
                ?: throw IllegalStateException("Android screen capture is unavailable on this device.")
            val projection = manager.getMediaProjection(resultCode, resultData)
                ?: throw IllegalStateException("Android did not grant screen capture permission.")

            val metrics = displayMetrics()
            val maxDimension = 1600
            val scale = minOf(1f, maxDimension.toFloat() / metrics.widthPixels, maxDimension.toFloat() / metrics.heightPixels)
            val width = (metrics.widthPixels * scale).toInt().coerceAtLeast(1)
            val height = (metrics.heightPixels * scale).toInt().coerceAtLeast(1)
            val dpi = metrics.densityDpi.coerceAtLeast(120)

            val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3)
            val thread = HandlerThread("HubMindScreenCapture").apply { start() }
            val handler = Handler(thread.looper)
            val callback = object : MediaProjection.Callback() {
                override fun onStop() {
                    stopInternal(stopProjection = false)
                    AndroidScreenShareEvents.emit(AndroidScreenShareEvent("stopped"))
                }
            }
            projection.registerCallback(callback, handler)

            reader.setOnImageAvailableListener({ source ->
                val now = System.currentTimeMillis()
                if (now - lastFrameAt < FRAME_INTERVAL_MS) {
                    source.acquireLatestImage()?.close()
                    return@setOnImageAvailableListener
                }
                val image = source.acquireLatestImage() ?: return@setOnImageAvailableListener
                try {
                    lastFrameAt = now
                    val frame = imageToDataUrl(image)
                    if (frame != null) AndroidScreenShareEvents.emit(AndroidScreenShareEvent("frame", dataUrl = frame))
                } catch (error: Exception) {
                    AndroidScreenShareEvents.emit(AndroidScreenShareEvent("error", error = error.message ?: "Could not encode a screen frame."))
                } finally {
                    image.close()
                }
            }, handler)

            workerThread = thread
            workerHandler = handler
            imageReader = reader
            mediaProjection = projection
            stopping.set(false)
            virtualDisplay = projection.createVirtualDisplay(
                "Hub-Mind Jess Screen Share",
                width,
                height,
                dpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                reader.surface,
                null,
                handler
            ) ?: throw IllegalStateException("Android could not create the screen capture display.")

            AndroidScreenShareEvents.emit(AndroidScreenShareEvent("started"))
        } catch (error: Exception) {
            stopInternal(stopProjection = true)
            AndroidScreenShareEvents.emit(
                AndroidScreenShareEvent("error", error = error.message ?: "Could not start Android screen sharing.")
            )
        }
    }

    fun stopCapture() {
        stopInternal(stopProjection = true)
        AndroidScreenShareEvents.emit(AndroidScreenShareEvent("stopped"))
    }

    private fun displayMetrics(): DisplayMetrics {
        val metrics = DisplayMetrics()
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        @Suppress("DEPRECATION")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.maximumWindowMetrics.bounds
            metrics.widthPixels = bounds.width()
            metrics.heightPixels = bounds.height()
            metrics.densityDpi = context.resources.displayMetrics.densityDpi
        } else {
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(metrics)
        }
        return metrics
    }

    private fun imageToDataUrl(image: Image): String? {
        val plane = image.planes.firstOrNull() ?: return null
        val buffer: ByteBuffer = plane.buffer
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        if (pixelStride <= 0 || rowStride <= 0) return null
        val rowPadding = rowStride - pixelStride * image.width
        val paddedWidth = image.width + (rowPadding / pixelStride)
        val bitmap = Bitmap.createBitmap(paddedWidth, image.height, Bitmap.Config.ARGB_8888)
        buffer.rewind()
        bitmap.copyPixelsFromBuffer(buffer)
        val cropped = if (paddedWidth != image.width) {
            Bitmap.createBitmap(bitmap, 0, 0, image.width, image.height).also { bitmap.recycle() }
        } else bitmap

        val output = ByteArrayOutputStream()
        try {
            cropped.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)
            val encoded = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
            return "data:image/jpeg;base64,$encoded"
        } finally {
            cropped.recycle()
            output.close()
        }
    }

    private fun stopInternal(stopProjection: Boolean) {
        if (!stopping.compareAndSet(false, true) && mediaProjection == null && virtualDisplay == null) return
        try { imageReader?.setOnImageAvailableListener(null, null) } catch {}
        try { virtualDisplay?.release() } catch {}
        virtualDisplay = null
        try { imageReader?.close() } catch {}
        imageReader = null
        val projection = mediaProjection
        mediaProjection = null
        if (stopProjection) {
            try { projection?.stop() } catch {}
        }
        try { workerThread?.quitSafely() } catch {}
        workerThread = null
        workerHandler = null
        stopping.set(false)
    }

    companion object {
        private const val FRAME_INTERVAL_MS = 1000L
        private const val JPEG_QUALITY = 62
    }
}
