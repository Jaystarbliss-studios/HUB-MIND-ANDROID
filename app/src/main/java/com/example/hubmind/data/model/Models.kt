package com.example.hubmind.data.model

data class User(
    val id: String,
    val email: String,
    val displayName: String,
    val preferredName: String = "",
    val role: String = "staff", // "admin" | "staff"
    val status: String = "active", // "active" | "training" | "suspended" | "inactive"
    val photoUrl: String? = null,
    val phone: String? = null,
    val lastSeenAt: String = ""
)

enum class DevicePlatform {
    WINDOWS,
    ANDROID,
    WEB,
    LINUX,
    MACOS
}

enum class DeviceStatus {
    ONLINE,
    BUSY,
    OFFLINE,
    UNAVAILABLE
}

enum class DeviceCapability {
    WINDOW_MANAGEMENT,
    MOUSE_KEYBOARD_INPUT,
    SCREEN_READING,
    APP_LAUNCH,
    POWERSHELL_EXECUTION,
    CHROME_AUTOMATION,
    STORAGE_MANAGEMENT,
    MEDIA_STREAMING,
    ANDROID_ACCESSIBILITY,
    TELEPHONY_SMS,
    CAMERA_CAPTURE,
    NOTIFICATION_LISTENER
}

data class DeviceNode(
    val deviceId: String,
    val deviceName: String,
    val platform: DevicePlatform,
    val clientVersion: String,
    val status: DeviceStatus,
    val isCurrentDevice: Boolean = false,
    val fullControlActive: Boolean = false,
    val permissionMode: String = "allow-routine", // "ask" | "allow-routine" | "allow-everything"
    val capabilities: List<DeviceCapability> = emptyList(),
    val lastSeenAt: Long = System.currentTimeMillis(),
    val batteryPercent: Int? = null,
    val ipAddress: String? = null
)

data class DeviceCommand(
    val commandId: String,
    val sourceDeviceId: String,
    val targetDeviceId: String,
    val toolName: String,
    val arguments: Map<String, Any> = emptyMap(),
    val status: CommandStatus = CommandStatus.PENDING,
    val createdAt: Long = System.currentTimeMillis(),
    val completedAt: Long? = null,
    val result: CommandResult? = null
)

enum class CommandStatus {
    PENDING,
    ACKNOWLEDGED,
    RUNNING,
    COMPLETED,
    FAILED,
    CANCELLED
}

data class CommandResult(
    val success: Boolean,
    val verified: Boolean = false,
    val output: String? = null,
    val error: String? = null,
    val durationMs: Long = 0
)

enum class MessageSender {
    USER,
    JESS
}

data class ChatMessage(
    val id: String,
    val sender: MessageSender,
    val text: String,
    val timestamp: Long = System.currentTimeMillis(),
    val isStreaming: Boolean = false,
    val targetDeviceId: String? = null,
    val toolCallName: String? = null,
    val toolCallArgs: String? = null,
    val executionStatus: String? = null // "started", "completed", "done_verified", "failed"
)

data class Conversation(
    val id: String,
    val title: String,
    val summary: String = "",
    val messageCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val isLiveSession: Boolean = false
)

enum class MemoryCategory {
    PREFERENCE,
    INSTRUCTION,
    PERSONAL,
    WORKFLOW,
    FACT,
    SCHEDULE
}

data class UserMemory(
    val id: String,
    val userId: String,
    val content: String,
    val category: MemoryCategory,
    val importance: String = "medium", // "high" | "medium" | "low"
    val key: String? = null,
    val createdAt: String = "",
    val lastReferencedAt: String? = null
)

data class TaskItem(
    val id: String,
    val title: String,
    val description: String = "",
    val priority: String = "medium", // "urgent" | "high" | "medium" | "low"
    val status: String = "assigned", // "assigned" | "in_progress" | "completed" | "submitted"
    val assignedTo: String = "",
    val deadline: String? = null,
    val createdAt: String = ""
)

data class ActivityRecord(
    val id: String,
    val title: String,
    val details: String,
    val targetDevice: String,
    val status: CommandStatus,
    val timestamp: Long = System.currentTimeMillis(),
    val durationMs: Long = 0,
    val verified: Boolean = false
)

enum class JessLiveState {
    IDLE,
    LISTENING,
    THINKING,
    SPEAKING,
    INTERRUPTED,
    MUTED,
    ERROR
}

enum class LiveConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
}
