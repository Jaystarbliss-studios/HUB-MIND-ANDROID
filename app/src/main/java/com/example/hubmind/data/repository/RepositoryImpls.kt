package com.example.hubmind.data.repository

import android.content.Context
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import android.content.ClipboardManager
import android.content.ClipData
import android.content.Intent
import com.example.hubmind.data.model.*
import com.example.hubmind.agent.HubMindAccessibilityService
import com.example.hubmind.agent.HubMindAgentForegroundService
import com.example.BuildConfig
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.first
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.tasks.await
import java.util.UUID

class AuthRepositoryImpl(context: Context? = null) : AuthRepository {
    companion object {
        private const val FIRESTORE_DATABASE_ID =
            "ai-studio-hubmind-4cac2024-c6eb-4208-80cf-928714dfd430"
        private val ADMIN_EMAILS = setOf(
            "johnrufai242@gmail.com",
            "rufaijohnny@gmail.com"
        )
    }

    private val firebaseApp = context?.let { appContext ->
        FirebaseApp.getApps(appContext).firstOrNull()
            ?: FirebaseApp.initializeApp(appContext)
    }
    private val firebaseAuth = firebaseApp?.let { FirebaseAuth.getInstance(it) }
    private val firestore = firebaseApp?.let { app ->
        runCatching { FirebaseFirestore.getInstance(app, FIRESTORE_DATABASE_ID) }.getOrNull()
    }

    override val configurationError: String? = when {
        context == null -> "Firebase Android configuration is unavailable in this test context."
        firebaseApp == null -> "Firebase is not configured for this Android app. Register the Android package in the existing Hub-Mind Firebase project and add app/google-services.json."
        firebaseAuth == null || firestore == null -> "Firebase could not be initialised. Check app/google-services.json and the registered Android package."
        else -> null
    }

    private val _currentUser = MutableStateFlow<User?>(null)
    override val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    private val _isSessionValid = MutableStateFlow(false)
    override val isSessionValid: StateFlow<Boolean> = _isSessionValid.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var profileListener: ListenerRegistration? = null

    init {
        firebaseAuth?.addAuthStateListener { auth ->
            val firebaseUser = auth.currentUser
            if (firebaseUser == null) {
                profileListener?.remove()
                profileListener = null
                _currentUser.value = null
                _isSessionValid.value = false
            } else {
                scope.launch {
                    runCatching { loadAuthorizedProfile(firebaseUser) }
                        .onSuccess { profile ->
                            _currentUser.value = profile
                            _isSessionValid.value = true
                            observeProfileChanges(firebaseUser)
                        }
                        .onFailure {
                            _currentUser.value = null
                            _isSessionValid.value = false
                        }
                }
            }
        }
    }

    private fun observeProfileChanges(firebaseUser: FirebaseUser) {
        val db = firestore ?: return
        profileListener?.remove()
        profileListener = db.collection("users")
            .document(firebaseUser.uid)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    _currentUser.value = null
                    _isSessionValid.value = false
                    return@addSnapshotListener
                }
                if (snapshot == null || !snapshot.exists()) {
                    _currentUser.value = null
                    _isSessionValid.value = false
                    firebaseAuth?.signOut()
                    return@addSnapshotListener
                }

                val data = snapshot.data.orEmpty()
                val status = (data["status"] as? String).orEmpty()
                if (status == "inactive" || status == "suspended") {
                    _currentUser.value = null
                    _isSessionValid.value = false
                    return@addSnapshotListener
                }

                _currentUser.value = mapAuthorizedProfile(data, firebaseUser)
                _isSessionValid.value = true
            }
    }

    override suspend fun signIn(email: String, password: String): Result<User> {
        val auth = firebaseAuth
            ?: return Result.failure(IllegalStateException(configurationError ?: "Firebase Auth is unavailable."))
        if (email.isBlank() || password.isBlank()) {
            return Result.failure(IllegalArgumentException("Enter your Hub-Mind email and password."))
        }

        return runCatching {
            val credential = auth.signInWithEmailAndPassword(email.trim(), password).await()
            val firebaseUser = credential.user
                ?: throw IllegalStateException("Firebase did not return an authenticated user.")
            val profile = loadAuthorizedProfile(firebaseUser)
            _currentUser.value = profile
            _isSessionValid.value = true
            profile
        }.fold(
            onSuccess = { Result.success(it) },
            onFailure = { error ->
                auth.signOut()
                _currentUser.value = null
                _isSessionValid.value = false
                Result.failure(error)
            }
        )
    }

    override suspend fun signInWithGoogle(idToken: String): Result<User> {
        val auth = firebaseAuth
            ?: return Result.failure(IllegalStateException(configurationError ?: "Firebase Auth is unavailable."))
        if (idToken.isBlank()) {
            return Result.failure(IllegalArgumentException("A real Google ID token is required."))
        }

        return runCatching {
            val credential = GoogleAuthProvider.getCredential(idToken, null)
            val result = auth.signInWithCredential(credential).await()
            val firebaseUser = result.user
                ?: throw IllegalStateException("Google sign-in did not return an authenticated user.")
            val profile = loadAuthorizedProfile(firebaseUser)
            _currentUser.value = profile
            _isSessionValid.value = true
            profile
        }.fold(
            onSuccess = { Result.success(it) },
            onFailure = { error ->
                auth.signOut()
                _currentUser.value = null
                _isSessionValid.value = false
                Result.failure(error)
            }
        )
    }

    private suspend fun loadAuthorizedProfile(firebaseUser: FirebaseUser): User {
        val db = firestore ?: throw IllegalStateException(
            configurationError ?: "Cloud Firestore is unavailable."
        )
        val uid = firebaseUser.uid
        val email = firebaseUser.email?.trim()?.lowercase().orEmpty()
        if (email.isBlank()) {
            throw IllegalStateException("The signed-in Firebase account has no email address.")
        }

        val profileRef = db.collection("users").document(uid)
        var snapshot = profileRef.get().await()

        // Match the website's bootstrap rule: only configured administrator
        // identities may create their own initial admin profile.
        if (!snapshot.exists() && email in ADMIN_EMAILS) {
            val displayName = firebaseUser.displayName?.takeIf { it.isNotBlank() }
                ?: email.substringBefore("@")
            val usernameBase = email.substringBefore("@")
                .lowercase()
                .replace(Regex("[^a-z0-9_]"), "")
                .take(22)
                .ifBlank { "hubmind" }
            val username = usernameBase + "_" + uid.takeLast(6).lowercase()
            val now = java.time.Instant.now().toString()
            val bootstrapProfile = mapOf(
                "id" to uid,
                "username" to username,
                "email" to email,
                "name" to displayName,
                "displayName" to displayName,
                "role" to "admin",
                "status" to "active",
                "createdAt" to now,
                "approvedAt" to now,
                "defaultVisibility" to "workspace"
            )
            profileRef.set(bootstrapProfile).await()
            snapshot = profileRef.get().await()
        }

        if (!snapshot.exists()) {
            throw IllegalStateException(
                "This account has no Hub-Mind profile. Ask an administrator to authorise it from the main website."
            )
        }

        val data = snapshot.data.orEmpty()
        val status = (data["status"] as? String).orEmpty()
        // Match the website: only explicit inactive/suspended states block
        // sign-in. Other valid profile states (including training) are retained.
        if (status == "suspended" || status == "inactive") {
            throw IllegalStateException("Your Hub-Mind account is currently inactive. Contact an administrator.")
        }

        return mapAuthorizedProfile(data, firebaseUser)
    }

    private fun mapAuthorizedProfile(data: Map<String, Any>, firebaseUser: FirebaseUser): User {
        val email = firebaseUser.email?.trim()?.lowercase().orEmpty()
        return User(
            id = firebaseUser.uid,
            email = email,
            displayName = (data["displayName"] as? String)
                ?: (data["name"] as? String)
                ?: firebaseUser.displayName
                ?: email.substringBefore("@"),
            preferredName = data["preferredName"] as? String ?: "",
            role = data["role"] as? String ?: "staff",
            status = data["status"] as? String ?: "active",
            photoUrl = firebaseUser.photoUrl?.toString() ?: data["photoUrl"] as? String,
            phone = data["phone"] as? String,
            lastSeenAt = java.time.Instant.now().toString()
        )
    }

    override suspend fun getIdToken(): String? {
        return runCatching {
            firebaseAuth?.currentUser?.getIdToken(false)?.await()?.token
        }.getOrNull()
    }

    override suspend fun signOut() {
        firebaseAuth?.signOut()
        _currentUser.value = null
        _isSessionValid.value = false
    }

    override suspend fun checkHealth(): Boolean {
        return firebaseApp != null && firebaseAuth != null && firestore != null
    }
}
class ConversationRepositoryImpl : ConversationRepository {
    // This repository is intentionally local-only until the Android Firestore
    // conversation adapter is connected to the website's StoredConversation schema.
    // It starts empty instead of displaying fabricated historical conversations.
    private val _conversations = MutableStateFlow<List<Conversation>>(emptyList())
    override val conversations: StateFlow<List<Conversation>> = _conversations.asStateFlow()

    private val _currentConversation = MutableStateFlow<Conversation?>(null)
    override val currentConversation: StateFlow<Conversation?> = _currentConversation.asStateFlow()

    private val messagesMap = mutableMapOf<String, MutableStateFlow<List<ChatMessage>>>()

    override fun getMessages(conversationId: String): Flow<List<ChatMessage>> {
        return messagesMap.getOrPut(conversationId) { MutableStateFlow(emptyList()) }.asStateFlow()
    }

    override suspend fun selectConversation(conversationId: String) {
        _currentConversation.value = _conversations.value.find { it.id == conversationId }
    }

    override suspend fun createConversation(title: String): Conversation {
        val now = System.currentTimeMillis()
        val newConv = Conversation(
            id = "conv-" + UUID.randomUUID().toString(),
            title = title.ifBlank { "New Jess Conversation" },
            summary = "",
            messageCount = 0,
            createdAt = now,
            updatedAt = now
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
        val message = ChatMessage(
            id = "msg-" + UUID.randomUUID().toString(),
            sender = MessageSender.USER,
            text = text,
            timestamp = System.currentTimeMillis(),
            targetDeviceId = targetDeviceId
        )
        val flow = messagesMap.getOrPut(conversationId) { MutableStateFlow(emptyList()) }
        flow.value = flow.value + message
        return message
    }

    override suspend fun appendJessResponse(
        conversationId: String,
        text: String,
        toolName: String?,
        status: String?
    ): ChatMessage {
        val message = ChatMessage(
            id = "msg-" + UUID.randomUUID().toString(),
            sender = MessageSender.JESS,
            text = text,
            timestamp = System.currentTimeMillis(),
            toolCallName = toolName,
            executionStatus = status
        )
        val flow = messagesMap.getOrPut(conversationId) { MutableStateFlow(emptyList()) }
        flow.value = flow.value + message
        return message
    }
}
class JessRepositoryImpl(
    private val conversationRepository: ConversationRepository,
    private val authRepository: AuthRepository,
    private val deviceControlRepository: DeviceControlRepository,
    private val deviceRegistryRepository: DeviceRegistryRepository
) : JessRepository {
    private val _liveState = MutableStateFlow(JessLiveState.IDLE)
    override val liveState: StateFlow<JessLiveState> = _liveState.asStateFlow()

    // HTTP chat can be available independently of the Gemini Live audio session.
    // Do not report a live voice connection until the Android WebSocket client
    // and lease coordination have actually been implemented.
    private val _connectionState = MutableStateFlow(LiveConnectionState.DISCONNECTED)
    override val connectionState: StateFlow<LiveConnectionState> = _connectionState.asStateFlow()

    private val _activeLeaseClient = MutableStateFlow<String?>(null)
    override val activeLeaseClient: StateFlow<String?> = _activeLeaseClient.asStateFlow()

    override suspend fun startVoiceSession(): Boolean {
        _connectionState.value = LiveConnectionState.ERROR
        _liveState.value = JessLiveState.ERROR
        _activeLeaseClient.value = null
        return false
    }

    override suspend fun endVoiceSession() {
        _liveState.value = JessLiveState.IDLE
        _connectionState.value = LiveConnectionState.DISCONNECTED
        _activeLeaseClient.value = null
    }

    override suspend fun setLiveState(state: JessLiveState) {
        _liveState.value = state
    }

    override suspend fun sendPrompt(prompt: String, targetDeviceId: String?): Flow<String> = flow {
        require(prompt.isNotBlank()) { "Enter a message for Jess." }
        _liveState.value = JessLiveState.THINKING

        try {
            val answer = withContext(Dispatchers.IO) {
                val idToken = authRepository.getIdToken()
                    ?: throw IllegalStateException("Your Hub-Mind sign-in session is unavailable. Sign in again.")

                val baseUrl = BuildConfig.HUBMIND_API_BASE_URL.trimEnd('/')
                if (!baseUrl.startsWith("https://")) {
                    throw IllegalStateException("Hub-Mind API must use HTTPS.")
                }

                val conversation = conversationRepository.currentConversation.value
                val priorMessages = conversation?.let {
                    conversationRepository.getMessages(it.id).first()
                }.orEmpty().takeLast(80)

                val messageArray = JSONArray()
                priorMessages.forEach { message ->
                    if (message.text.isNotBlank()) {
                        messageArray.put(
                            JSONObject()
                                .put("role", if (message.sender == MessageSender.USER) "user" else "model")
                                .put("parts", JSONArray().put(JSONObject().put("text", message.text)))
                        )
                    }
                }
                if (priorMessages.isEmpty() || priorMessages.last().sender != MessageSender.USER ||
                    priorMessages.last().text != prompt
                ) {
                    messageArray.put(
                        JSONObject()
                            .put("role", "user")
                            .put("parts", JSONArray().put(JSONObject().put("text", prompt)))
                    )
                }

                val systemInstruction = buildString {
                    append("You are Jess, the assistant inside the user's Hub-Mind Android application. ")
                    append("Answer naturally and use the authenticated Hub-Mind backend. ")
                    append("This Android build does not yet have an operational remote device command transport. ")
                    append("Never claim that you opened an app, changed a device, read a screen, sent a message, ")
                    append("or performed another device action unless a real native execution result is supplied. ")
                    append("When asked to control another device, explain that cross-device execution is not connected yet.")
                    if (!targetDeviceId.isNullOrBlank()) {
                        append(" The user's currently selected device ID is ")
                        append(targetDeviceId)
                        append(", but selection alone does not prove that the device is online or controllable.")
                    }
                }

                val requestBody = JSONObject()
                    .put("messages", messageArray)
                    .put("systemInstruction", systemInstruction)
                    .put("autoSearch", true)

                val connection = (URL(baseUrl + "/api/chat").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 15000
                    readTimeout = 60000
                    doOutput = true
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setRequestProperty("Authorization", "Bearer " + idToken)
                }

                try {
                    connection.outputStream.use { output ->
                        output.write(requestBody.toString().toByteArray(Charsets.UTF_8))
                    }

                    val statusCode = connection.responseCode
                    val responseStream = if (statusCode in 200..299) {
                        connection.inputStream
                    } else {
                        connection.errorStream
                    }
                    val responseBody = responseStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                    val responseJson = runCatching { JSONObject(responseBody) }.getOrNull()

                    if (statusCode !in 200..299) {
                        val detail = responseJson?.optString("text")
                            ?.takeIf { it.isNotBlank() }
                            ?: responseJson?.optString("error")?.takeIf { it.isNotBlank() }
                            ?: "Hub-Mind backend returned HTTP " + statusCode + "."
                        throw IllegalStateException(detail)
                    }

                    responseJson?.optString("text")?.takeIf { it.isNotBlank() }
                        ?: throw IllegalStateException("Jess backend returned an empty response.")
                } finally {
                    connection.disconnect()
                }
            }

            _connectionState.value = LiveConnectionState.CONNECTED
            _liveState.value = JessLiveState.SPEAKING
            emit(answer)
            _liveState.value = JessLiveState.IDLE
        } catch (error: Exception) {
            _connectionState.value = LiveConnectionState.ERROR
            _liveState.value = JessLiveState.ERROR
            throw error
        }
    }
}
class DeviceRegistryRepositoryImpl(private val context: Context) : DeviceRegistryRepository {
    private fun buildLocalDevice(): DeviceNode {
        val androidId = android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        )?.takeIf { it.isNotBlank() } ?: "unknown"
        val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val battery = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            ?.takeIf { it in 0..100 }
        val capabilities = buildList {
            add(DeviceCapability.APP_LAUNCH)
            if (HubMindAccessibilityService.isServiceConnected) {
                add(DeviceCapability.ANDROID_ACCESSIBILITY)
                add(DeviceCapability.WINDOW_MANAGEMENT)
                add(DeviceCapability.MOUSE_KEYBOARD_INPUT)
                add(DeviceCapability.SCREEN_READING)
            }
        }

        return DeviceNode(
            deviceId = "android-$androidId",
            deviceName = listOf(Build.MANUFACTURER, Build.MODEL)
                .filter { it.isNotBlank() }
                .distinct()
                .joinToString(" ")
                .ifBlank { "Android device" },
            platform = DevicePlatform.ANDROID,
            clientVersion = runCatching {
                context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown"
            }.getOrDefault("unknown"),
            status = DeviceStatus.ONLINE,
            isCurrentDevice = true,
            fullControlActive = HubMindAccessibilityService.isServiceConnected && HubMindAgentForegroundService.isRunning.value,
            permissionMode = "ask",
            capabilities = capabilities,
            batteryPercent = battery
        )
    }

    private val localDevice = buildLocalDevice()
    private val _devices = MutableStateFlow(listOf(localDevice))
    override val devices: StateFlow<List<DeviceNode>> = _devices.asStateFlow()

    private val _currentTargetDevice = MutableStateFlow<DeviceNode?>(localDevice)
    override val currentTargetDevice: StateFlow<DeviceNode?> = _currentTargetDevice.asStateFlow()

    override suspend fun selectTargetDevice(deviceId: String) {
        _currentTargetDevice.value = _devices.value.firstOrNull { it.deviceId == deviceId }
    }

    override suspend fun registerCurrentDevice(androidNode: DeviceNode) {
        if (androidNode.platform != DevicePlatform.ANDROID || !androidNode.isCurrentDevice) {
            throw IllegalArgumentException("Only the current Android endpoint may register itself through this local registry.")
        }
        _devices.value = _devices.value.filterNot { it.deviceId == androidNode.deviceId } + androidNode
    }

    override suspend fun pingDevice(deviceId: String): Boolean {
        val device = _devices.value.firstOrNull { it.deviceId == deviceId } ?: return false
        return device.isCurrentDevice && device.status == DeviceStatus.ONLINE
    }

    override suspend fun refreshDevices() {
        val refreshed = buildLocalDevice()
        _devices.value = listOf(refreshed)
        if (_currentTargetDevice.value?.deviceId == refreshed.deviceId || _currentTargetDevice.value == null) {
            _currentTargetDevice.value = refreshed
        }
    }
}
class DeviceControlRepositoryImpl(
    private val transports: List<ControlTransport>,
    private val deviceRegistryRepository: DeviceRegistryRepository
) : DeviceControlRepository {
    private val _commandHistory = MutableStateFlow<List<DeviceCommand>>(emptyList())
    override val commandHistory: StateFlow<List<DeviceCommand>> = _commandHistory.asStateFlow()

    private val _activityRecords = MutableStateFlow<List<ActivityRecord>>(emptyList())
    override val activityRecords: StateFlow<List<ActivityRecord>> = _activityRecords.asStateFlow()

    override suspend fun executeTool(
        targetDeviceId: String,
        toolName: String,
        args: Map<String, Any>
    ): CommandResult {
        val startedAt = System.currentTimeMillis()
        val cmdId = "cmd-" + UUID.randomUUID().toString()
        val target = deviceRegistryRepository.devices.value.firstOrNull {
            it.deviceId == targetDeviceId
        }

        val command = DeviceCommand(
            commandId = cmdId,
            sourceDeviceId = deviceRegistryRepository.devices.value.firstOrNull { it.isCurrentDevice }?.deviceId
                ?: "unknown-source",
            targetDeviceId = targetDeviceId,
            toolName = toolName,
            arguments = args,
            status = CommandStatus.PENDING,
            createdAt = startedAt
        )
        _commandHistory.value = listOf(command) + _commandHistory.value

        if (target == null) {
            return finishCommand(
                command,
                CommandResult(
                    success = false,
                    verified = false,
                    error = "Target device is not registered or is not currently available to this app.",
                    durationMs = System.currentTimeMillis() - startedAt
                )
            )
        }

        val transport = transports.firstOrNull { candidate ->
            runCatching { candidate.canReachDevice(target) }.getOrDefault(false)
        }

        if (transport == null) {
            return finishCommand(
                command,
                CommandResult(
                    success = false,
                    verified = false,
                    error = "No authenticated control transport is connected to the target device. No command was sent.",
                    durationMs = System.currentTimeMillis() - startedAt
                )
            )
        }

        val running = command.copy(status = CommandStatus.RUNNING)
        _commandHistory.value = _commandHistory.value.map {
            if (it.commandId == cmdId) running else it
        }

        val result = runCatching { transport.dispatchCommand(running) }
            .getOrElse { error ->
                CommandResult(
                    success = false,
                    verified = false,
                    error = error.message ?: "The target device transport failed.",
                    durationMs = System.currentTimeMillis() - startedAt
                )
            }
        return finishCommand(running, result.copy(durationMs = System.currentTimeMillis() - startedAt))
    }

    private fun finishCommand(command: DeviceCommand, result: CommandResult): CommandResult {
        val finalStatus = when {
            result.success && result.verified -> CommandStatus.COMPLETED
            result.success -> CommandStatus.ACKNOWLEDGED
            else -> CommandStatus.FAILED
        }
        val finished = command.copy(
            status = finalStatus,
            completedAt = System.currentTimeMillis(),
            result = result
        )
        _commandHistory.value = _commandHistory.value.map {
            if (it.commandId == command.commandId) finished else it
        }
        _activityRecords.value = listOf(
            ActivityRecord(
                id = "act-" + UUID.randomUUID().toString(),
                title = command.toolName,
                details = result.error ?: result.output ?: "Command returned without details.",
                targetDevice = command.targetDeviceId,
                status = finalStatus,
                timestamp = System.currentTimeMillis(),
                durationMs = result.durationMs,
                verified = result.verified
            )
        ) + _activityRecords.value
        return result
    }

    override suspend fun cancelCommand(commandId: String): Boolean {
        val current = _commandHistory.value.firstOrNull { it.commandId == commandId } ?: return false
        if (current.status in setOf(CommandStatus.COMPLETED, CommandStatus.FAILED, CommandStatus.CANCELLED)) {
            return false
        }
        _commandHistory.value = _commandHistory.value.map {
            if (it.commandId == commandId) it.copy(status = CommandStatus.CANCELLED) else it
        }
        return true
    }
}
class AndroidAgentControllerImpl(private val context: Context) : AndroidAgentController {
    override fun getBatteryLevel(): Int {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        return bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 } ?: -1
    }

    override fun isCharging(): Boolean {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val status = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS)
        return status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
    }

    override fun getInstalledAppPackages(): List<String> {
        val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return context.packageManager.queryIntentActivities(launcherIntent, 0)
            .mapNotNull { it.activityInfo?.packageName }
            .distinct()
            .sorted()
    }

    override fun launchApplication(packageName: String): Boolean {
        if (packageName.isBlank()) return false
        val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching {
            context.startActivity(intent)
            true
        }.getOrDefault(false)
    }

    override fun getSystemAudioVolume(): Int {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val max = am?.getStreamMaxVolume(AudioManager.STREAM_MUSIC) ?: 15
        val current = am?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: 10
        return if (max > 0) (current * 100) / max else 0
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

class PermissionStatusRepositoryImpl(private val context: Context) : PermissionStatusRepository {
    private val _hasRecordAudio = MutableStateFlow(false)
    override val hasRecordAudio: StateFlow<Boolean> = _hasRecordAudio.asStateFlow()

    private val _hasPostNotifications = MutableStateFlow(false)
    override val hasPostNotifications: StateFlow<Boolean> = _hasPostNotifications.asStateFlow()

    private val _hasSystemAlertWindow = MutableStateFlow(false)
    override val hasSystemAlertWindow: StateFlow<Boolean> = _hasSystemAlertWindow.asStateFlow()

    private val _hasAccessibilityService = MutableStateFlow(false)
    override val hasAccessibilityService: StateFlow<Boolean> = _hasAccessibilityService.asStateFlow()

    init {
        refresh()
    }

    override fun refresh() {
        _hasRecordAudio.value = context.checkSelfPermission(
            android.Manifest.permission.RECORD_AUDIO
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

        _hasPostNotifications.value = android.os.Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED

        _hasSystemAlertWindow.value = android.provider.Settings.canDrawOverlays(context)

        val expectedComponent = android.content.ComponentName(
            context,
            HubMindAccessibilityService::class.java
        ).flattenToString()
        val enabledServices = android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ).orEmpty()
        _hasAccessibilityService.value = enabledServices.split(':').any {
            it.equals(expectedComponent, ignoreCase = true)
        }
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
