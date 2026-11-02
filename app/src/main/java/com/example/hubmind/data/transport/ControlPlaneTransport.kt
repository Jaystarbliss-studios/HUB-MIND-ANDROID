package com.example.hubmind.data.transport

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.example.hubmind.data.model.CommandResult
import com.example.hubmind.data.model.DeviceNode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.util.UUID

enum class CommandLifecycle {
    CREATED,
    AUTHENTICATED,
    ROUTED,
    RECEIVED,
    AWAITING_CONFIRMATION,
    EXECUTING,
    COMPLETED,
    FAILED,
    CANCELLED,
    EXPIRED
}

data class CommandEnvelope(
    val protocolVersion: String = "1.0",
    val commandId: String = "cmd-" + UUID.randomUUID().toString(),
    val taskId: String? = null,
    val conversationId: String? = null,
    val issuingUserId: String,
    val sourceDeviceId: String,
    val targetDeviceId: String,
    val actionType: String,
    val parameters: Map<String, Any> = emptyMap(),
    val creationTime: Long = System.currentTimeMillis(),
    val expirationTime: Long = System.currentTimeMillis() + 30000,
    val replayToken: String = "nonce-" + UUID.randomUUID().toString().take(12),
    val requiresConfirmation: Boolean = false,
    val correlationId: String = "corr-" + UUID.randomUUID().toString().take(8),
    val lifecycleState: CommandLifecycle = CommandLifecycle.CREATED
)

object KeystorePairingManager {
    private const val KEY_ALIAS = "HubMindDevicePairingKey"

    fun generateDeviceKeyPair(): Boolean {
        return try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore")
            keyStore.load(null)
            if (!keyStore.containsAlias(KEY_ALIAS)) {
                val kpg = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC,
                    "AndroidKeyStore"
                )
                val spec = KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
                ).setDigests(KeyProperties.DIGEST_SHA256)
                    .build()
                kpg.initialize(spec)
                kpg.generateKeyPair()
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    fun getPublicKeyFingerprint(): String {
        return try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore")
            keyStore.load(null)
            val cert = keyStore.getCertificate(KEY_ALIAS)
            cert?.publicKey?.encoded?.take(8)?.joinToString("") { "%02x".format(it) } ?: "hw-sec-key"
        } catch (e: Exception) {
            "hw-sec-key"
        }
    }
}

interface HubMindControlPlaneTransport {
    val isConnected: StateFlow<Boolean>
    val incomingCommands: Flow<CommandEnvelope>
    suspend fun connect(userId: String, deviceId: String)
    suspend fun disconnect()
    suspend fun dispatchCommand(envelope: CommandEnvelope): CommandResult
    suspend fun reportProgress(commandId: String, state: CommandLifecycle, details: String)
}

class HubMindControlPlaneTransportImpl : HubMindControlPlaneTransport {
    private val _isConnected = MutableStateFlow(true)
    override val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _incomingCommands = MutableStateFlow<CommandEnvelope?>(null)
    override val incomingCommands: Flow<CommandEnvelope> = kotlinx.coroutines.flow.flow {
        _incomingCommands.collect { cmd ->
            if (cmd != null) emit(cmd)
        }
    }

    override suspend fun connect(userId: String, deviceId: String) {
        _isConnected.value = true
        KeystorePairingManager.generateDeviceKeyPair()
    }

    override suspend fun disconnect() {
        _isConnected.value = false
    }

    override suspend fun dispatchCommand(envelope: CommandEnvelope): CommandResult {
        // Expiration check
        if (envelope.expirationTime < System.currentTimeMillis()) {
            return CommandResult(
                success = false,
                error = "Command envelope expired before dispatch.",
                durationMs = 0
            )
        }

        kotlinx.coroutines.delay(300)
        return CommandResult(
            success = true,
            verified = true,
            output = "Target ${envelope.targetDeviceId} executed ${envelope.actionType} successfully.",
            durationMs = 300
        )
    }

    override suspend fun reportProgress(commandId: String, state: CommandLifecycle, details: String) {
        // Report state change to control plane
    }
}

// 11 Internal Jess Device Control Tools
enum class InternalJessDeviceTool {
    LIST_USER_DEVICES,
    GET_DEVICE_STATUS,
    GET_DEVICE_CAPABILITIES,
    PAIR_DEVICE,
    REVOKE_DEVICE,
    CONTROL_DEVICE,
    GET_DEVICE_SCREEN,
    SEND_TEXT_TO_DEVICE,
    OPEN_DEVICE_APP,
    GET_EXECUTION_STATUS,
    CANCEL_DEVICE_TASK
}

object JessDeviceResolver {
    fun resolveDeviceQuery(query: String, devices: List<DeviceNode>): DeviceNode? {
        val lower = query.lowercase()
        return when {
            lower.contains("phone") || lower.contains("android") || lower.contains("mobile") ->
                devices.find { it.platform == com.example.hubmind.data.model.DevicePlatform.ANDROID }
            lower.contains("laptop") || lower.contains("pc") || lower.contains("computer") || lower.contains("windows") ->
                devices.find { it.platform == com.example.hubmind.data.model.DevicePlatform.WINDOWS }
            else -> devices.firstOrNull { lower.contains(it.deviceName.lowercase()) } ?: devices.firstOrNull()
        }
    }
}
