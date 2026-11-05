package com.example.hubmind.agent

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.example.hubmind.MainActivity
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * User-enabled foreground session for the Android device agent and user-consented
 * MediaProjection capture. It remains alive while the user works in other apps.
 */
class HubMindAgentForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "hubmind_agent_session_channel"
        private const val NOTIFICATION_ID = 2844
        private const val TAG = "HubMindAndroidAgent"
        private const val ACTION_START_SCREEN_CAPTURE = "com.example.hubmind.action.START_SCREEN_CAPTURE"
        private const val ACTION_STOP_SCREEN_CAPTURE = "com.example.hubmind.action.STOP_SCREEN_CAPTURE"
        private const val EXTRA_CAPTURE_RESULT_CODE = "captureResultCode"
        private const val EXTRA_CAPTURE_RESULT_DATA = "captureResultData"

        fun startService(context: Context) {
            val intent = Intent(context, HubMindAgentForegroundService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stopService(context: Context) {
            context.stopService(Intent(context, HubMindAgentForegroundService::class.java))
        }

        fun startScreenCapture(context: Context, resultCode: Int, resultData: Intent) {
            val intent = Intent(context, HubMindAgentForegroundService::class.java).apply {
                action = ACTION_START_SCREEN_CAPTURE
                putExtra(EXTRA_CAPTURE_RESULT_CODE, resultCode)
                putExtra(EXTRA_CAPTURE_RESULT_DATA, resultData)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun stopScreenCapture(context: Context) {
            val intent = Intent(context, HubMindAgentForegroundService::class.java).apply {
                action = ACTION_STOP_SCREEN_CAPTURE
            }
            context.startService(intent)
        }
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pollingJob: Job? = null
    private lateinit var commandWorker: AndroidDeviceCommandWorker
    private lateinit var screenCaptureManager: AndroidScreenCaptureManager

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        commandWorker = AndroidDeviceCommandWorker(applicationContext)
        screenCaptureManager = AndroidScreenCaptureManager(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val captureRequested = intent?.action == ACTION_START_SCREEN_CAPTURE
        startAgentForeground(captureRequested)

        when (intent?.action) {
            ACTION_START_SCREEN_CAPTURE -> {
                val resultCode = intent.getIntExtra(EXTRA_CAPTURE_RESULT_CODE, Activity.RESULT_CANCELED)
                @Suppress("DEPRECATION")
                val resultData = intent.getParcelableExtra<Intent>(EXTRA_CAPTURE_RESULT_DATA)
                if (resultCode == Activity.RESULT_OK && resultData != null) {
                    screenCaptureManager.start(resultCode, resultData)
                } else {
                    AndroidScreenShareEvents.emit(
                        AndroidScreenShareEvent("error", error = "Android screen capture permission was not granted.")
                    )
                }
            }
            ACTION_STOP_SCREEN_CAPTURE -> {
                screenCaptureManager.stopCapture()
                val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                manager.notify(NOTIFICATION_ID, buildNotification())
            }
        }

        if (pollingJob?.isActive != true) {
            pollingJob = serviceScope.launch {
                while (isActive) {
                    try {
                        commandWorker.pollOnce()
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (error: Exception) {
                        Log.w(TAG, "Android device-agent heartbeat/command poll failed: ${error.message}")
                    }
                    delay(AndroidDeviceCommandWorker.POLL_INTERVAL_MS)
                }
            }
        }
        return START_STICKY
    }

    private fun startAgentForeground(includeMediaProjection: Boolean) {
        val types = when {
            Build.VERSION.SDK_INT >= 34 && includeMediaProjection ->
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            Build.VERSION.SDK_INT >= 34 -> ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && includeMediaProjection ->
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            else -> 0
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && types != 0) {
            startForeground(NOTIFICATION_ID, buildNotification(), types)
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
    }

    private fun buildNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Hub-Mind Android Agent Active")
            .setContentText(
                if (screenCaptureManagerOrFalse()) "Jess is receiving screen frames. Tap to return to Hub-Mind."
                else "Your phone is available for commands you explicitly request."
            )
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun screenCaptureManagerOrFalse(): Boolean =
        ::screenCaptureManager.isInitialized && screenCaptureManager.isCaptureActive

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        if (::screenCaptureManager.isInitialized) screenCaptureManager.stopCapture()
        AndroidScreenShareEvents.emit(AndroidScreenShareEvent("stopped"))
        pollingJob?.cancel()
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Hub-Mind Android Device Agent",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Visible foreground session for owner-authorized Android device commands and screen sharing."
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }
}
