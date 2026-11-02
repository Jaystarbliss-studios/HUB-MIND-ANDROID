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
    val connectionState: LiveConnectionState = LiveConnectionState.CONNECTED,
    val targetDevice: DeviceNode? = null,
    val isMicActive: Boolean = false,
    val currentInput: String = "",
    val isSending: Boolean = false
)

class JessHomeViewModel(
    private val jessRepository: JessRepository,
    private val conversationRepository: ConversationRepository,
    private val deviceRegistryRepository: DeviceRegistryRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(JessHomeUiState())
    val uiState: StateFlow<JessHomeUiState> = _uiState.asStateFlow()

    init {
        // Collect current conversation
        viewModelScope.launch {
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
        val next = !_uiState.value.isMicActive
        _uiState.value = _uiState.value.copy(isMicActive = next)
        viewModelScope.launch {
            if (next) {
                jessRepository.startVoiceSession()
            } else {
                jessRepository.endVoiceSession()
            }
        }
    }

    fun sendPrompt(customPrompt: String? = null) {
        val text = customPrompt ?: _uiState.value.currentInput
        if (text.isBlank()) return

        val conv = _uiState.value.currentConversation ?: return
        val target = _uiState.value.targetDevice?.deviceId

        _uiState.value = _uiState.value.copy(currentInput = "", isSending = true)

        viewModelScope.launch {
            // Post user message
            conversationRepository.postUserMessage(conv.id, text, target)

            // Query Jess
            val responseFlow = jessRepository.sendPrompt(text, target)
            var responseText = ""
            responseFlow.collect { chunk ->
                responseText = chunk
            }

            // Append Jess response
            conversationRepository.appendJessResponse(
                conversationId = conv.id,
                text = responseText,
                toolName = if (text.contains("open", true) || text.contains("launch", true) || text.contains("pc", true)) "device_action" else null,
                status = "done_verified"
            )

            _uiState.value = _uiState.value.copy(isSending = false)
        }
    }

    fun switchTargetDevice() {
        viewModelScope.launch {
            val list = deviceRegistryRepository.devices.value
            val current = _uiState.value.targetDevice
            val next = list.firstOrNull { it.deviceId != current?.deviceId } ?: list.firstOrNull()
            next?.let { deviceRegistryRepository.selectTargetDevice(it.deviceId) }
        }
    }
}
