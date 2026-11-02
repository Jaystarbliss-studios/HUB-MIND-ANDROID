package com.example.hubmind.data.repository

import com.example.hubmind.data.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

interface AuthRepository {
    val currentUser: StateFlow<User?>
    val isSessionValid: StateFlow<Boolean>
    suspend fun signIn(email: String, password: String): Result<User>
    suspend fun signInWithGoogle(idToken: String): Result<User>
    suspend fun signOut()
    suspend fun checkHealth(): Boolean
}

interface ConversationRepository {
    val conversations: StateFlow<List<Conversation>>
    val currentConversation: StateFlow<Conversation?>
    fun getMessages(conversationId: String): Flow<List<ChatMessage>>
    suspend fun selectConversation(conversationId: String)
    suspend fun createConversation(title: String): Conversation
    suspend fun postUserMessage(conversationId: String, text: String, targetDeviceId: String? = null): ChatMessage
    suspend fun appendJessResponse(conversationId: String, text: String, toolName: String? = null, status: String? = null): ChatMessage
}

interface JessRepository {
    val liveState: StateFlow<JessLiveState>
    val connectionState: StateFlow<LiveConnectionState>
    val activeLeaseClient: StateFlow<String?>
    suspend fun startVoiceSession(): Boolean
    suspend fun endVoiceSession()
    suspend fun sendPrompt(prompt: String, targetDeviceId: String?): Flow<String>
    suspend fun setLiveState(state: JessLiveState)
}

interface DeviceRegistryRepository {
    val devices: StateFlow<List<DeviceNode>>
    val currentTargetDevice: StateFlow<DeviceNode?>
    suspend fun selectTargetDevice(deviceId: String)
    suspend fun registerCurrentDevice(androidNode: DeviceNode)
    suspend fun pingDevice(deviceId: String): Boolean
    suspend fun refreshDevices()
}

interface ControlTransport {
    val transportName: String
    suspend fun canReachDevice(device: DeviceNode): Boolean
    suspend fun dispatchCommand(command: DeviceCommand): CommandResult
}

interface DeviceControlRepository {
    val commandHistory: StateFlow<List<DeviceCommand>>
    val activityRecords: StateFlow<List<ActivityRecord>>
    suspend fun executeTool(targetDeviceId: String, toolName: String, args: Map<String, Any>): CommandResult
    suspend fun cancelCommand(commandId: String): Boolean
}

interface AndroidAgentController {
    fun getBatteryLevel(): Int
    fun isCharging(): Boolean
    fun getInstalledAppPackages(): List<String>
    fun launchApplication(packageName: String): Boolean
    fun getSystemAudioVolume(): Int
    fun setSystemAudioVolume(levelPercent: Int)
    fun copyToClipboard(label: String, text: String)
    fun readFromClipboard(): String?
}

interface PermissionStatusRepository {
    val hasRecordAudio: StateFlow<Boolean>
    val hasPostNotifications: StateFlow<Boolean>
    val hasSystemAlertWindow: StateFlow<Boolean>
    val hasAccessibilityService: StateFlow<Boolean>
    fun updatePermissions(
        audio: Boolean,
        notifications: Boolean,
        overlay: Boolean,
        accessibility: Boolean
    )
}

interface VoiceInteractionRepository {
    val isMicMuted: StateFlow<Boolean>
    val audioInputLevel: StateFlow<Float>
    val audioOutputLevel: StateFlow<Float>
    suspend fun setMicMuted(muted: Boolean)
    suspend fun updateLevels(input: Float, output: Float)
}
