package com.example.hubmind.ui.screens.home

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hubmind.data.model.*
import com.example.hubmind.data.repository.AuthRepository
import com.example.hubmind.data.repository.ConversationRepository
import com.example.hubmind.data.repository.DeviceRegistryRepository
import com.example.hubmind.data.repository.JessRepository
import com.example.hubmind.voice.GeminiLiveVoiceSession
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class JessHomeUiState(
    val currentConversation: Conversation? = null,
    val messages: List<ChatMessage> = emptyList(),
    val liveState: JessLiveState = JessLiveState.IDLE,
    val connectionState: LiveConnectionState = LiveConnectionState.DISCONNECTED,
    val targetDevice: DeviceNode? = null,
    val isMicActive: Boolean = false,
    val currentInput: String = "",
    val liveTranscript: String = "",
    val isSending: Boolean = false,
    val noticeMessage: String? = null
)

class JessHomeViewModel(
    private val jessRepository: JessRepository,
    private val conversationRepository: ConversationRepository,
    private val deviceRegistryRepository: DeviceRegistryRepository,
    private val authRepository: AuthRepository,
    context: Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(JessHomeUiState())
    val uiState: StateFlow<JessHomeUiState> = _uiState.asStateFlow()

    private var pendingLiveUserText = ""
    private val pendingLiveAssistantText = StringBuilder()

    private val liveVoiceSession = GeminiLiveVoiceSession(
        context = context.applicationContext,
        authRepository = authRepository,
        onConnectionState = { connection ->
            _uiState.update { it.copy(connectionState = connection) }
        },
        onJessState = { state ->
            _uiState.update { it.copy(liveState = state) }
        },
        onUserTranscript = { transcript ->
            pendingLiveUserText = transcript
            _uiState.update { it.copy(currentInput = transcript) }
        },
        onJessTranscript = { transcript ->
            synchronized(pendingLiveAssistantText) {
                pendingLiveAssistantText.append(transcript)
                _uiState.update { it.copy(liveTranscript = pendingLiveAssistantText.toString()) }
            }
        },
        onTurnComplete = {
            viewModelScope.launch { persistLiveTurn() }
        },
        onError = { message ->
            _uiState.update { it.copy(noticeMessage = message) }
        }
    )

    init {
        viewModelScope.launch {
            if (conversationRepository.currentConversation.value == null) {
                conversationRepository.createConversation("New Jess Conversation")
            }
            conversationRepository.currentConversation.collect { conv ->
                _uiState.update { it.copy(currentConversation = conv) }
                conv?.let { loadMessages(it.id) }
            }
        }

        viewModelScope.launch {
            jessRepository.liveState.collect { state ->
                if (!liveVoiceSession.isConnected) _uiState.update { it.copy(liveState = state) }
            }
        }

        viewModelScope.launch {
            jessRepository.connectionState.collect { conn ->
                if (!liveVoiceSession.isConnected) _uiState.update { it.copy(connectionState = conn) }
            }
        }

        viewModelScope.launch {
            deviceRegistryRepository.currentTargetDevice.collect { device ->
                _uiState.update { it.copy(targetDevice = device) }
            }
        }
    }

    private fun loadMessages(conversationId: String) {
        viewModelScope.launch {
            conversationRepository.getMessages(conversationId).collect { msgList ->
                _uiState.update { it.copy(messages = msgList) }
            }
        }
    }

    private suspend fun persistLiveTurn() {
        val conversation = _uiState.value.currentConversation ?: return
        val userText = pendingLiveUserText.trim()
        val assistantText = synchronized(pendingLiveAssistantText) {
            pendingLiveAssistantText.toString().trim().also { pendingLiveAssistantText.clear() }
        }
        if (userText.isNotBlank()) {
            conversationRepository.postUserMessage(
                conversationId = conversation.id,
                text = userText,
                targetDeviceId = _uiState.value.targetDevice?.deviceId
            )
        }
        if (assistantText.isNotBlank()) {
            conversationRepository.appendJessResponse(
                conversationId = conversation.id,
                text = assistantText,
                toolName = null,
                status = null
            )
        }
        pendingLiveUserText = ""
        _uiState.update { it.copy(currentInput = "", liveTranscript = "") }
    }

    fun onInputChange(text: String) {
        _uiState.update { it.copy(currentInput = text) }
    }

    fun showNotice(message: String) {
        _uiState.update { it.copy(noticeMessage = message) }
    }

    fun toggleMic() {
        if (_uiState.value.isMicActive) {
            viewModelScope.launch {
                liveVoiceSession.disconnect()
                _uiState.update {
                    it.copy(
                        isMicActive = false,
                        liveState = JessLiveState.IDLE,
                        noticeMessage = "Jess Live voice session stopped."
                    )
                }
            }
        } else {
            viewModelScope.launch {
                val user = authRepository.currentUser.value
                val started = liveVoiceSession.connect(
                    userName = user?.preferredName?.takeIf { it.isNotBlank() }
                        ?: user?.displayName.orEmpty(),
                    userRole = user?.role.orEmpty()
                )
                _uiState.update {
                    it.copy(
                        isMicActive = started,
                        noticeMessage = if (started) null
                        else it.noticeMessage ?: "Jess Live could not start. Check your internet and microphone permission."
                    )
                }
            }
        }
    }

    fun sendPrompt(customPrompt: String? = null) {
        val text = (customPrompt ?: _uiState.value.currentInput).trim()
        if (text.isBlank() || _uiState.value.isSending) return

        if (liveVoiceSession.isConnected) {
            viewModelScope.launch {
                val conversation = _uiState.value.currentConversation
                    ?: conversationRepository.createConversation("New Jess Conversation")
                conversationRepository.postUserMessage(
                    conversation.id,
                    text,
                    _uiState.value.targetDevice?.deviceId
                )
                if (!liveVoiceSession.sendText(text)) {
                    _uiState.update { it.copy(noticeMessage = "Jess Live could not send that message. Try again.") }
                }
                _uiState.update { it.copy(currentInput = "") }
            }
            return
        }

        _uiState.update {
            it.copy(currentInput = "", isSending = true, noticeMessage = null)
        }

        viewModelScope.launch {
            var conversation = _uiState.value.currentConversation
            if (conversation == null) {
                conversation = conversationRepository.createConversation("New Jess Conversation")
            }
            val target = _uiState.value.targetDevice?.deviceId
            conversationRepository.postUserMessage(conversation.id, text, target)

            try {
                var responseText = ""
                jessRepository.sendPrompt(text, target).collect { chunk ->
                    responseText = chunk
                }
                if (responseText.isBlank()) {
                    throw IllegalStateException("Jess returned an empty response.")
                }
                conversationRepository.appendJessResponse(
                    conversationId = conversation.id,
                    text = responseText,
                    toolName = null,
                    status = null
                )
            } catch (error: Exception) {
                val message = error.message ?: "Jess could not complete the request."
                conversationRepository.appendJessResponse(
                    conversationId = conversation.id,
                    text = message,
                    toolName = null,
                    status = "failed"
                )
                _uiState.update { it.copy(noticeMessage = message) }
            } finally {
                _uiState.update { it.copy(isSending = false) }
            }
        }
    }

    fun switchTargetDevice() {
        viewModelScope.launch {
            val list = deviceRegistryRepository.devices.value
            if (list.size <= 1) {
                _uiState.update {
                    it.copy(noticeMessage = "Only this Android phone is registered in the current build. Connect the Windows agent and device registry before switching targets.")
                }
                return@launch
            }
            val current = _uiState.value.targetDevice
            val next = list.firstOrNull { it.deviceId != current?.deviceId }
            next?.let { deviceRegistryRepository.selectTargetDevice(it.deviceId) }
        }
    }

    override fun onCleared() {
        liveVoiceSession.dispose()
        super.onCleared()
    }
}
