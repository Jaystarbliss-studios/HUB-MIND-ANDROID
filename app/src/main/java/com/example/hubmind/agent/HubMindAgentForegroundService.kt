package com.example.hubmind.agent

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
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
 * User-enabled foreground service for the Android device agent.
 *
 * The service advertises the phone's presence and receives only commands scoped
 * to the Firebase user who is currently signed into the Hub-Mind workspace WebView.
 * Android accessibility permissions remain separately controlled by the user.
 */
class HubMindAgentForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "hubmind_agent_session_channel"
        private const val NOTIFICATION_ID = 2844
        private const val TAG = "HubMindAndroidAgent"

        fun startService(context: Context) {
            val intent = Intent(context, HubMindAgentForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            context.stopService(Intent(context, HubMindAgentForegroundService::class.java))
        }
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pollingJob: Job? = null
    private lateinit var commandWorker: AndroidDeviceCommandWorker

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        commandWorker = AndroidDeviceCommandWorker(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val pendingIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Hub-Mind Android Agent Active")
            .setContentText("Your phone is available for commands you explicitly request.")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()

        startForeground(NOTIFICATION_ID, notification)

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

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
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
                description = "Visible foreground session for owner-authorized Android device commands."
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }
}
