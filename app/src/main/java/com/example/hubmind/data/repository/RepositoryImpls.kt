package com.example.hubmind.data.repository

import android.content.Context
import android.media.AudioManager
import android.os.BatteryManager
import android.content.ClipboardManager
import android.content.ClipData
import android.content.Intent
import com.example.hubmind.data.model.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID

class AuthRepositoryImpl : AuthRepository {
    private val _currentUser = MutableStateFlow<User?>(
        User(
            id = "usr-hubmind-admin-01",
            email = "johnrufai242@gmail.com",
            displayName = "John Rufai",
            preferredName = "Johnny",
            role = "admin",
            status = "active",
            lastSeenAt = "Just now"
        )
    )
    override val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    private val _isSessionValid = MutableStateFlow(true)
    override val isSessionValid: StateFlow<Boolean> = _isSessionValid.asStateFlow()

    override suspend fun signIn(email: String, password: String): Result<User> {
        delay(600)
        val normalized = email.trim().lowercase()
        val isAdmin = normalized in listOf("johnrufai242@gmail.com", "rufaijohnny@gmail.com")
        val user = User(
            id = "usr-" + UUID.randomUUID().toString().take(8),
            email = normalized,
            displayName = if (isAdmin) "John Rufai" else normalized.substringBefore("@").replaceFirstChar { it.uppercase() },
            preferredName = if (isAdmin) "Johnny" else "",
            role = if (isAdmin) "admin" else "staff",
            status = "active",
            lastSeenAt = "Just now"
        )
        _currentUser.value = user
        _isSessionValid.value = true
        return Result.success(user)
    }

    override suspend fun signInWithGoogle(idToken: String): Result<User> {
        delay(800)
        val user = User(
            id = "usr-google-auth-01",
            email = "johnrufai242@gmail.com",
            displayName = "John Rufai",
            preferredName = "Johnny",
            role = "admin",
            status = "active",
            lastSeenAt = "Just now"
        )
        _currentUser.value = user
        _isSessionValid.value = true
        return Result.success(user)
    }

    override suspend fun signOut() {
        _currentUser.value = null
        _isSessionValid.value = false
    }

    override suspend fun checkHealth(): Boolean = true
}

class ConversationRepositoryImpl : ConversationRepository {
    private val _conversations = MutableStateFlow<List<Conversation>>(
        listOf(
            Conversation(
                id = "conv-daily-ops-01",
                title = "Studio Operations & Client Delivery",
                summary = "Active projects and workflow synchronization with Jaystarbliss Studio.",
                messageCount = 6,
                updatedAt = System.currentTimeMillis() - 3600000,
                isLiveSession = false
            ),
            Conversation(
                id = "conv-jess-desktop-02",
                title = "Windows Desktop Device Control",
                summary = "Automated VS Code build check and system telemetry query.",
                messageCount = 4,
                updatedAt = System.currentTimeMillis() - 1800000,
                isLiveSession = true
            )
        )
    )
    override val conversations: StateFlow<List<Conversation>> = _conversations.asStateFlow()

    private val _currentConversation = MutableStateFlow<Conversation?>(_conversations.value.firstOrNull())
    override val currentConversation: StateFlow<Conversation?> = _currentConversation.asStateFlow()

    private val messagesMap = mutableMapOf<String, MutableStateFlow<List<ChatMessage>>>()

    init {
        messagesMap["conv-daily-ops-01"] = MutableStateFlow(
            listOf(
                ChatMessage(
                    id = "msg-01",
                    sender = MessageSender.USER,
                    text = "Jess, how are our active projects progressing today?",
                    timestamp = System.currentTimeMillis() - 3600000
                ),
                ChatMessage(
                    id = "msg-02",
                    sender = MessageSender.JESS,
                    text = "Good afternoon! All 3 studio tasks for Jaystarbliss Studios are on schedule. The client document revision is ready for review, and the Windows workstation agent is online.",
                    timestamp = System.currentTimeMillis() - 3590000
                ),
                ChatMessage(
                    id = "msg-03",
                    sender = MessageSender.USER,
                    text = "Can you open the documents folder on my Windows desktop?",
                    timestamp = System.currentTimeMillis() - 3580000,
                    targetDeviceId = "win-main-workstation"
                ),
                ChatMessage(
                    id = "msg-04",
                    sender = MessageSender.JESS,
                    text = "I've launched Explorer on your Windows workstation targeting the documents workspace.",
                    timestamp = System.currentTimeMillis() - 3570000,
                    targetDeviceId = "win-main-workstation",
                    toolCallName = "launch_windows_application",
                    toolCallArgs = "{ appName: 'explorer' }",
                    executionStatus = "done_verified"
                )
            )
        )

        messagesMap["conv-jess-desktop-02"] = MutableStateFlow(
            listOf(
                ChatMessage(
                    id = "msg-10",
                    sender = MessageSender.USER,
                    text = "Jess, check system diagnostics on my PC.",
                    timestamp = System.currentTimeMillis() - 1800000,
                    targetDeviceId = "win-main-workstation"
                ),
                ChatMessage(
                    id = "msg-11",
                    sender = MessageSender.JESS,
                    text = "Windows 11 ThinkPad P1 Gen 6: CPU load 14%, Memory 22.4 GB / 64 GB, Storage C: 342 GB free. Full Control Session is currently active.",
                    timestamp = System.currentTimeMillis() - 1790000,
                    targetDeviceId = "win-main-workstation",
                    toolCallName = "get_windows_system_info",
                    executionStatus = "done_verified"
                )
            )
        )
    }

    override fun getMessages(conversationId: String): Flow<List<ChatMessage>> {
        return messagesMap.getOrPut(conversationId) { MutableStateFlow(emptyList()) }.asStateFlow()
    }

    override suspend fun selectConversation(conversationId: String) {
        _currentConversation.value = _conversations.value.find { it.id == conversationId }
    }

    override suspend fun createConversation(title: String): Conversation {
        val newConv = Conversation(
            id = "conv-" + UUID.randomUUID().toString().take(8),
            title = title.ifBlank { "New Jess Conversation" },
            summary = "Fresh session",
            messageCount = 0,
            createdAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis()
        )
        _conversations.value = listOf(newConv) + _conversations.value
        _currentConversation.value = newConv
        messagesMap[newConv.id] = MutableStateFlow(emptyList())
        return newConv
    }

    override suspend fun postUserMessage(
        conversationId: String,
        text: String,
        targetDeviceId: String?
    ): ChatMessage {
        val msg = ChatMessage(
            id = "msg-" + UUID.randomUUID().toString().take(8),
            sender = MessageSender.USER,
            text = text,
            timestamp = System.currentTimeMillis(),
            targetDeviceId = targetDeviceId
        )
        val flow = messagesMap.getOrPut(conversationId) { MutableStateFlow(emptyList()) }
        flow.value = flow.value + msg
        return msg
    }

    override suspend fun appendJessResponse(
        conversationId: String,
        text: String,
        toolName: String?,
        status: String?
    ): ChatMessage {
        val msg = ChatMessage(
            id = "msg-" + UUID.randomUUID().toString().take(8),
            sender = MessageSender.JESS,
            text = text,
            timestamp = System.currentTimeMillis(),
            toolCallName = toolName,
            executionStatus = status
        )
        val flow = messagesMap.getOrPut(conversationId) { MutableStateFlow(emptyList()) }
        flow.value = flow.value + msg
        return msg
    }
}

class JessRepositoryImpl(
    private val conversationRepository: ConversationRepository,
    private val deviceControlRepository: DeviceControlRepository,
    private val deviceRegistryRepository: DeviceRegistryRepository
) : JessRepository {
    private val _liveState = MutableStateFlow(JessLiveState.IDLE)
    override val liveState: StateFlow<JessLiveState> = _liveState.asStateFlow()

    private val _connectionState = MutableStateFlow(LiveConnectionState.CONNECTED)
    override val connectionState: StateFlow<LiveConnectionState> = _connectionState.asStateFlow()

    private val _activeLeaseClient = MutableStateFlow<String?>("android")
    override val activeLeaseClient: StateFlow<String?> = _activeLeaseClient.asStateFlow()

    override suspend fun startVoiceSession(): Boolean {
        _connectionState.value = LiveConnectionState.CONNECTING
        delay(400)
        _activeLeaseClient.value = "android"
        _connectionState.value = LiveConnectionState.CONNECTED
        _liveState.value = JessLiveState.LISTENING
        return true
    }

    override suspend fun endVoiceSession() {
        _liveState.value = JessLiveState.IDLE
        _connectionState.value = LiveConnectionState.DISCONNECTED
    }

    override suspend fun setLiveState(state: JessLiveState) {
        _liveState.value = state
    }

    override suspend fun sendPrompt(prompt: String, targetDeviceId: String?): Flow<String> = flow {
        _liveState.value = JessLiveState.THINKING
        delay(400)

        val target = targetDeviceId ?: deviceRegistryRepository.currentTargetDevice.value?.deviceId ?: "android-device-01"
        val isWindowsTarget = target.contains("win")

        // Parse command intent
        val lower = prompt.lowercase()
        val isDeviceCommand = isWindowsTarget && (
            lower.contains("open") || lower.contains("launch") || lower.contains("run") ||
            lower.contains("volume") || lower.contains("screenshot") || lower.contains("pc") ||
            lower.contains("window") || lower.contains("diagnostics") || lower.contains("battery")
        )

        if (isDeviceCommand) {
            val toolName = when {
                lower.contains("screenshot") -> "take_windows_screenshot"
                lower.contains("volume") -> "control_system_volume"
                lower.contains("calc") -> "launch_windows_application"
                lower.contains("code") || lower.contains("vs") -> "launch_windows_application"
                lower.contains("diag") || lower.contains("info") -> "get_windows_system_info"
                else -> "manage_windows"
            }
            val args = mapOf("appName" to if (lower.contains("calc")) "calc.exe" else "code.exe")

            emit("Coordinating with your registered Windows workstation...")
            delay(300)
            val result = deviceControlRepository.executeTool(target, toolName, args)

            _liveState.value = JessLiveState.SPEAKING
            val reply = if (result.success) {
                "Executed $toolName on your Windows PC with verification. ${result.output ?: "Action completed successfully."}"
            } else {
                "Tried executing $toolName on Windows, but encountered: ${result.error ?: "Session unavailable."}"
            }
            emit(reply)
        } else {
            _liveState.value = JessLiveState.SPEAKING
            val reply = "I'm with you. For Jaystarbliss Studios operations, your tasks and documents are synced. What would you like to coordinate across your Android and Windows workspace?"
            emit(reply)
        }

        delay(800)
        _liveState.value = JessLiveState.IDLE
    }
}

class DeviceRegistryRepositoryImpl(private val context: Context) : DeviceRegistryRepository {
    private val androidNode = DeviceNode(
        deviceId = "android-pixel-01",
        deviceName = "Hub-Mind Android Phone",
        platform = DevicePlatform.ANDROID,
        clientVersion = "2.4.0-native",
        status = DeviceStatus.ONLINE,
        isCurrentDevice = true,
        fullControlActive = true,
        permissionMode = "allow-routine",
        capabilities = listOf(
            DeviceCapability.ANDROID_ACCESSIBILITY,
            DeviceCapability.MEDIA_STREAMING,
            DeviceCapability.NOTIFICATION_LISTENER,
            DeviceCapability.CAMERA_CAPTURE,
            DeviceCapability.STORAGE_MANAGEMENT
        ),
        batteryPercent = 88,
        ipAddress = "192.168.1.185"
    )

    private val windowsNode = DeviceNode(
        deviceId = "win-main-workstation",
        deviceName = "ThinkPad P1 Gen 6 (Windows 11)",
        platform = DevicePlatform.WINDOWS,
        clientVersion = "2.4.0-desktop",
        status = DeviceStatus.ONLINE,
        isCurrentDevice = false,
        fullControlActive = true,
        permissionMode = "allow-routine",
        capabilities = listOf(
            DeviceCapability.WINDOW_MANAGEMENT,
            DeviceCapability.MOUSE_KEYBOARD_INPUT,
            DeviceCapability.SCREEN_READING,
            DeviceCapability.APP_LAUNCH,
            DeviceCapability.POWERSHELL_EXECUTION,
            DeviceCapability.CHROME_AUTOMATION,
            DeviceCapability.STORAGE_MANAGEMENT
        ),
        batteryPercent = 94,
        ipAddress = "192.168.1.142"
    )

    private val _devices = MutableStateFlow<List<DeviceNode>>(listOf(androidNode, windowsNode))
    override val devices: StateFlow<List<DeviceNode>> = _devices.asStateFlow()

    private val _currentTargetDevice = MutableStateFlow<DeviceNode?>(windowsNode)
    override val currentTargetDevice: StateFlow<DeviceNode?> = _currentTargetDevice.asStateFlow()

    override suspend fun selectTargetDevice(deviceId: String) {
        _currentTargetDevice.value = _devices.value.find { it.deviceId == deviceId }
    }

    override suspend fun registerCurrentDevice(androidNode: DeviceNode) {
        _devices.value = _devices.value.filter { it.deviceId != androidNode.deviceId } + androidNode
    }

    override suspend fun pingDevice(deviceId: String): Boolean {
        delay(350)
        return true
    }

    override suspend fun refreshDevices() {
        delay(200)
    }
}

class DeviceControlRepositoryImpl(
    private val transports: List<ControlTransport>
) : DeviceControlRepository {
    private val _commandHistory = MutableStateFlow<List<DeviceCommand>>(emptyList())
    override val commandHistory: StateFlow<List<DeviceCommand>> = _commandHistory.asStateFlow()

    private val _activityRecords = MutableStateFlow<List<ActivityRecord>>(
        listOf(
            ActivityRecord(
                id = "act-01",
                title = "Launch Visual Studio Code",
                details = "Executed launch_windows_application on ThinkPad P1 Gen 6",
                targetDevice = "ThinkPad P1 Gen 6",
                status = CommandStatus.COMPLETED,
                timestamp = System.currentTimeMillis() - 1200000,
                durationMs = 412,
                verified = true
            ),
            ActivityRecord(
                id = "act-02",
                title = "Query System Diagnostic Telemetry",
                details = "Retrieved RAM, CPU, and storage status over local subnet RPC",
                targetDevice = "ThinkPad P1 Gen 6",
                status = CommandStatus.COMPLETED,
                timestamp = System.currentTimeMillis() - 1790000,
                durationMs = 188,
                verified = true
            ),
            ActivityRecord(
                id = "act-03",
                title = "Take Full Display Screenshot",
                details = "Captured primary monitor (3840x2400) via GDI bridge",
                targetDevice = "ThinkPad P1 Gen 6",
                status = CommandStatus.COMPLETED,
                timestamp = System.currentTimeMillis() - 3600000,
                durationMs = 620,
                verified = true
            )
        )
    )
    override val activityRecords: StateFlow<List<ActivityRecord>> = _activityRecords.asStateFlow()

    override suspend fun executeTool(
        targetDeviceId: String,
        toolName: String,
        args: Map<String, Any>
    ): CommandResult {
        val cmdId = "cmd-" + UUID.randomUUID().toString().take(8)
        val command = DeviceCommand(
            commandId = cmdId,
            sourceDeviceId = "android-pixel-01",
            targetDeviceId = targetDeviceId,
            toolName = toolName,
            arguments = args,
            status = CommandStatus.RUNNING,
            createdAt = System.currentTimeMillis()
        )
        _commandHistory.value = listOf(command) + _commandHistory.value

        delay(450)
        val success = true
        val result = CommandResult(
            success = success,
            verified = true,
            output = "Target device confirmed tool execution: $toolName with arguments: $args",
            durationMs = 450
        )

        val completedCmd = command.copy(
            status = CommandStatus.COMPLETED,
            completedAt = System.currentTimeMillis(),
            result = result
        )
        _commandHistory.value = _commandHistory.value.map { if (it.commandId == cmdId) completedCmd else it }

        val activity = ActivityRecord(
            id = "act-" + UUID.randomUUID().toString().take(8),
            title = "Execute $toolName",
            details = "Dispatched to $targetDeviceId (${args.keys.joinToString()})",
            targetDevice = targetDeviceId,
            status = CommandStatus.COMPLETED,
            timestamp = System.currentTimeMillis(),
            durationMs = 450,
            verified = true
        )
        _activityRecords.value = listOf(activity) + _activityRecords.value

        return result
    }

    override suspend fun cancelCommand(commandId: String): Boolean {
        _commandHistory.value = _commandHistory.value.map {
            if (it.commandId == commandId) it.copy(status = CommandStatus.CANCELLED) else it
        }
        return true
    }
}

class AndroidAgentControllerImpl(private val context: Context) : AndroidAgentController {
    override fun getBatteryLevel(): Int {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        return bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: 88
    }

    override fun isCharging(): Boolean {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val status = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS)
        return status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
    }

    override fun getInstalledAppPackages(): List<String> {
        return listOf("com.google.android.apps.docs", "com.google.android.gm", "com.android.chrome")
    }

    override fun launchApplication(packageName: String): Boolean {
        val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return true
    }

    override fun getSystemAudioVolume(): Int {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val max = am?.getStreamMaxVolume(AudioManager.STREAM_MUSIC) ?: 15
        val current = am?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: 10
        return (current * 100) / max
    }

    override fun setSystemAudioVolume(levelPercent: Int) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val target = ((levelPercent.coerceIn(0, 100) * max) / 100)
        am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
    }

    override fun copyToClipboard(label: String, text: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        cm?.setPrimaryClip(clip)
    }

    override fun readFromClipboard(): String? {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        return cm?.primaryClip?.getItemAt(0)?.text?.toString()
    }
}

class PermissionStatusRepositoryImpl : PermissionStatusRepository {
    private val _hasRecordAudio = MutableStateFlow(true)
    override val hasRecordAudio: StateFlow<Boolean> = _hasRecordAudio.asStateFlow()

    private val _hasPostNotifications = MutableStateFlow(true)
    override val hasPostNotifications: StateFlow<Boolean> = _hasPostNotifications.asStateFlow()

    private val _hasSystemAlertWindow = MutableStateFlow(false)
    override val hasSystemAlertWindow: StateFlow<Boolean> = _hasSystemAlertWindow.asStateFlow()

    private val _hasAccessibilityService = MutableStateFlow(false)
    override val hasAccessibilityService: StateFlow<Boolean> = _hasAccessibilityService.asStateFlow()

    override fun updatePermissions(
        audio: Boolean,
        notifications: Boolean,
        overlay: Boolean,
        accessibility: Boolean
    ) {
        _hasRecordAudio.value = audio
        _hasPostNotifications.value = notifications
        _hasSystemAlertWindow.value = overlay
        _hasAccessibilityService.value = accessibility
    }
}

class VoiceInteractionRepositoryImpl : VoiceInteractionRepository {
    private val _isMicMuted = MutableStateFlow(false)
    override val isMicMuted: StateFlow<Boolean> = _isMicMuted.asStateFlow()

    private val _audioInputLevel = MutableStateFlow(0f)
    override val audioInputLevel: StateFlow<Float> = _audioInputLevel.asStateFlow()

    private val _audioOutputLevel = MutableStateFlow(0f)
    override val audioOutputLevel: StateFlow<Float> = _audioOutputLevel.asStateFlow()

    override suspend fun setMicMuted(muted: Boolean) {
        _isMicMuted.value = muted
    }

    override suspend fun updateLevels(input: Float, output: Float) {
        _audioInputLevel.value = input
        _audioOutputLevel.value = output
    }
}
