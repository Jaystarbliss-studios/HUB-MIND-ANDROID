package com.example.hubmind.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hubmind.data.model.*
import com.example.hubmind.data.repository.ConversationRepository
import com.example.hubmind.data.repository.DeviceRegistryRepository
import com.example.hubmind.data.repository.JessRepository
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
    val isSending: Boolean = false,
    val noticeMessage: String? = null
)

class JessHomeViewModel(
    private val jessRepository: JessRepository,
    private val conversationRepository: ConversationRepository,
    private val deviceRegistryRepository: DeviceRegistryRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(JessHomeUiState())
    val uiState: StateFlow<JessHomeUiState> = _uiState.asStateFlow()

    init {
        // Create a clean local draft until the Firebase conversation adapter
        // is connected. Do not seed the app with fabricated desktop history.
        viewModelScope.launch {
            if (conversationRepository.currentConversation.value == null) {
                conversationRepository.createConversation("New Jess Conversation")
            }
            conversationRepository.currentConversation.collect { conv ->
                _uiState.value = _uiState.value.copy(currentConversation = conv)
                conv?.let { loadMessages(it.id) }
            }
        }

        // Collect Jess live state
        viewModelScope.launch {
            jessRepository.liveState.collect { state ->
                _uiState.value = _uiState.value.copy(liveState = state)
            }
        }

        // Collect connection state
        viewModelScope.launch {
            jessRepository.connectionState.collect { conn ->
                _uiState.value = _uiState.value.copy(connectionState = conn)
            }
        }

        // Collect target device
        viewModelScope.launch {
            deviceRegistryRepository.currentTargetDevice.collect { device ->
                _uiState.value = _uiState.value.copy(targetDevice = device)
            }
        }
    }

    private fun loadMessages(conversationId: String) {
        viewModelScope.launch {
            conversationRepository.getMessages(conversationId).collect { msgList ->
                _uiState.value = _uiState.value.copy(messages = msgList)
            }
        }
    }

    fun onInputChange(text: String) {
        _uiState.value = _uiState.value.copy(currentInput = text)
    }

    fun toggleMic() {
        viewModelScope.launch {
            if (_uiState.value.isMicActive) {
                jessRepository.endVoiceSession()
                _uiState.value = _uiState.value.copy(
                    isMicActive = false,
                    noticeMessage = "Voice session stopped."
                )
            } else {
                val started = jessRepository.startVoiceSession()
                _uiState.value = _uiState.value.copy(
                    isMicActive = started,
                    noticeMessage = if (started) null else
                        "Jess Live voice is not connected in this build yet. Text chat uses the Hub-Mind backend."
                )
            }
        }
    }

    fun sendPrompt(customPrompt: String? = null) {
        val text = (customPrompt ?: _uiState.value.currentInput).trim()
        if (text.isBlank() || _uiState.value.isSending) return

        _uiState.value = _uiState.value.copy(
            currentInput = "",
            isSending = true,
            noticeMessage = null
        )

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
                _uiState.value = _uiState.value.copy(noticeMessage = message)
            } finally {
                _uiState.value = _uiState.value.copy(isSending = false)
            }
        }
    }

    fun switchTargetDevice() {
        viewModelScope.launch {
            val list = deviceRegistryRepository.devices.value
            if (list.size <= 1) {
                _uiState.value = _uiState.value.copy(
                    noticeMessage = "Only this Android phone is registered in the current build. Connect the Windows agent and device registry before switching targets."
                )
                return@launch
            }
            val current = _uiState.value.targetDevice
            val next = list.firstOrNull { it.deviceId != current?.deviceId }
            next?.let { deviceRegistryRepository.selectTargetDevice(it.deviceId) }
        }
    }
}
