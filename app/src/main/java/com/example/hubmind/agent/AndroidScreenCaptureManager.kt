package com.example.hubmind.agent

import android.content.Context
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager

class AndroidScreenCaptureManager(private val context: Context) {

    private var mediaProjection: MediaProjection? = null

    val isCaptureActive: Boolean get() = mediaProjection != null

    fun getMediaProjectionManager(): MediaProjectionManager? {
        return context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
    }

    fun onMediaProjectionGranted(projection: MediaProjection) {
        this.mediaProjection = projection
    }

    fun stopCapture() {
        mediaProjection?.stop()
        mediaProjection = null
    }
}
