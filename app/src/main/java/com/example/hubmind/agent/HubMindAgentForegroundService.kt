package com.example.hubmind.agent

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import com.example.hubmind.MainActivity
import com.example.hubmind.data.session.HubMindNativeSessionStore
import com.example.hubmind.data.transport.HubMindFirestoreRestClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class HubMindAgentForegroundService : Service() {

    companion object {
        private const val TAG = "HubMindAgent"
        private const val CHANNEL_ID = "hubmind_agent_session_channel"
        private const val NOTIFICATION_ID = 2844
        private const val POLL_INTERVAL_MS = 2500L
        private const val HEARTBEAT_INTERVAL_MS = 30000L

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
    private val firestore = HubMindFirestoreRestClient()
    private lateinit var actionExecutor: AndroidUiActionExecutor
    private var commandLoop: Job? = null
    private val inFlight = mutableSetOf<String>()
    private val deviceId: String by lazy {
        Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
            ?.takeIf { it.isNotBlank() }
            ?: "android-${Build.MANUFACTURER.lowercase()}-${Build.MODEL.hashCode().toUInt().toString(16)}"
    }
    private var lastHeartbeatAt = 0L
    private var lastHeartbeatUserId: String? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        actionExecutor = AndroidUiActionExecutor(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val pendingIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Hub-Mind Device Agent Active")
            .setContentText("Your phone is available for owner-authorized Jess commands.")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()

        startForeground(NOTIFICATION_ID, notification)

        if (commandLoop?.isActive != true) {
            commandLoop = serviceScope.launch { runCommandLoop() }
        }
        return START_STICKY
    }

    private suspend fun runCommandLoop() {
        while (serviceScope.isActive) {
            val credentials = HubMindNativeSessionStore.credentials.value
            if (credentials == null) {
                delay(POLL_INTERVAL_MS)
                continue
            }

            try {
                if (lastHeartbeatUserId != credentials.userId) {
                    lastHeartbeatUserId = credentials.userId
                    lastHeartbeatAt = 0L
                }
                val now = System.currentTimeMillis()
                if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
                    firestore.upsertAndroidDevice(
                        userId = credentials.userId,
                        deviceId = deviceId,
                        deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
                        capabilities = listOf(
                            "ANDROID_ACCESSIBILITY",
                            "APP_LAUNCH",
                            "SCREEN_HIERARCHY",
                            "CLIPBOARD",
                            "GLOBAL_NAVIGATION"
                        ),
                        lastSeenAt = now,
                        bearerToken = credentials.idToken
                    )
                    lastHeartbeatAt = now
                }

                val commands = firestore.listDeviceCommands(credentials.userId, credentials.idToken)
                for (command in commands) {
                    if (!serviceScope.isActive) break
                    if (command.id in inFlight) continue
                    if (command.fields["targetDeviceId"] != deviceId) continue
                    if (command.fields["status"] != "CREATED") continue

                    val expiry = (command.fields["expiresAt"] as? Number)?.toLong()
                        ?: (command.fields["expiresAt"] as? String)?.toLongOrNull()
                        ?: 0L
                    if (expiry > 0L && expiry < System.currentTimeMillis()) {
                        firestore.updateDeviceCommand(
                            credentials.userId,
                            command.id,
                            mapOf("status" to "EXPIRED", "updatedAt" to System.currentTimeMillis()),
                            credentials.idToken
                        )
                        continue
                    }

                    inFlight.add(command.id)
                    try {
                        processCommand(credentials.userId, credentials.idToken, command)
                    } finally {
                        inFlight.remove(command.id)
                    }
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w(TAG, "Command receiver cycle failed: ${error.message}")
                // Keep the foreground agent alive. A refreshed web token or a
                // recovered network connection will be picked up automatically.
            }

            delay(POLL_INTERVAL_MS)
        }
    }

    private suspend fun processCommand(
        userId: String,
        idToken: String,
        command: com.example.hubmind.data.transport.HubMindFirestoreDocument
    ) {
        val actionName = command.fields["actionType"] as? String ?: ""
        val actionType = runCatching { AndroidActionType.valueOf(actionName.uppercase()) }.getOrNull()
        if (actionType == null) {
            firestore.updateDeviceCommand(
                userId, command.id,
                mapOf(
                    "status" to "FAILED",
                    "error" to "Unsupported Android action: $actionName",
                    "updatedAt" to System.currentTimeMillis()
                ),
                idToken
            )
            return
        }

        val parameters = (command.fields["parameters"] as? Map<*, *>)
            ?.entries
            ?.mapNotNull { (key, value) -> if (key is String && value != null) key to value else null }
            ?.toMap()
            ?: emptyMap()

        firestore.updateDeviceCommand(
            userId, command.id,
            mapOf("status" to "EXECUTING", "startedAt" to System.currentTimeMillis(), "updatedAt" to System.currentTimeMillis()),
            idToken
        )

        val result = actionExecutor.executeCommand(
            AndroidCommand(
                commandId = command.id,
                actionType = actionType,
                parameters = parameters,
                expiryTimestamp = (command.fields["expiresAt"] as? Number)?.toLong()
                    ?: (command.fields["expiresAt"] as? String)?.toLongOrNull()
                    ?: (System.currentTimeMillis() + 30000L)
            )
        )

        val finalStatus = when {
            !result.success -> "FAILED"
            result.verified -> "COMPLETED"
            else -> "SENT_UNVERIFIED"
        }
        val resultFields = mapOf(
            "success" to result.success,
            "verified" to result.verified,
            "outputText" to (result.outputText ?: ""),
            "error" to (result.error ?: ""),
            "durationMs" to result.durationMs,
            "actionType" to actionName,
            "hierarchy" to result.hierarchy?.let { serializeHierarchy(it) },
            "installedApps" to result.installedApps?.take(150)?.map { app ->
                mapOf(
                    "packageName" to app.packageName,
                    "appName" to app.appName,
                    "isSystemApp" to app.isSystemApp
                )
            }
        )
        firestore.updateDeviceCommand(
            userId,
            command.id,
            mapOf(
                "status" to finalStatus,
                "result" to resultFields,
                "verified" to result.verified,
                "completedAt" to System.currentTimeMillis(),
                "updatedAt" to System.currentTimeMillis(),
                "error" to (result.error ?: "")
            ),
            idToken
        )
    }

    private fun serializeHierarchy(
        node: UiNodeInfo,
        depth: Int = 0,
        budget: IntArray = intArrayOf(0)
    ): Map<String, Any?> {
        if (depth > 8 || budget[0] >= 350) return mapOf("truncated" to true)
        budget[0] += 1
        return mapOf(
            "id" to node.id,
            "viewIdResourceName" to (node.viewIdResourceName ?: ""),
            "className" to (node.className ?: ""),
            "packageName" to (node.packageName ?: ""),
            "text" to (node.text ?: ""),
            "contentDescription" to (node.contentDescription ?: ""),
            "isClickable" to node.isClickable,
            "isEditable" to node.isEditable,
            "isScrollable" to node.isScrollable,
            "boundsInScreen" to mapOf(
                "left" to node.boundsInScreen.left,
                "top" to node.boundsInScreen.top,
                "right" to node.boundsInScreen.right,
                "bottom" to node.boundsInScreen.bottom,
                "centerX" to node.boundsInScreen.centerX,
                "centerY" to node.boundsInScreen.centerY
            ),
            "children" to node.children.take(30).map { child ->
                serializeHierarchy(child, depth + 1, budget)
            },
            "childrenTruncated" to (node.children.size > 30 || budget[0] >= 350)
        )
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        commandLoop?.cancel()
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
                description = "Visible notification while the user-enabled Android command receiver is active."
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }
}
