package com.example.hubmind.agent

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.example.hubmind.MainActivity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class HubMindAgentForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "hubmind_agent_session_channel"
        private const val NOTIFICATION_ID = 2844
        private val _isRunning = MutableStateFlow(false)
        val isRunning: StateFlow<Boolean> = _isRunning.asStateFlow()

        fun startService(context: Context): Boolean {
            val intent = Intent(context, HubMindAgentForegroundService::class.java)
            return runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                true
            }.getOrDefault(false)
        }

        fun stopService(context: Context) {
            val intent = Intent(context, HubMindAgentForegroundService::class.java)
            context.stopService(intent)
            _isRunning.value = false
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val pendingIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Hub-Mind Device Control Active")
            .setContentText("Jess native Android agent is running owner-authorized actions.")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()

        return try {
            startForeground(NOTIFICATION_ID, notification)
            _isRunning.value = true
            START_STICKY
        } catch (_: SecurityException) {
            _isRunning.value = false
            stopSelf(startId)
            START_NOT_STICKY
        } catch (_: IllegalStateException) {
            _isRunning.value = false
            stopSelf(startId)
            START_NOT_STICKY
        }
    }

    override fun onDestroy() {
        _isRunning.value = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Hub-Mind Agent Active Session",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Foreground session notification for Hub-Mind Jess device agent."
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }
}
