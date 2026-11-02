package com.example.hubmind.ui.screens.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hubmind.agent.*
import com.example.hubmind.data.model.User
import com.example.hubmind.data.repository.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class SettingsUiState(
    val user: User? = null,
    val permissionMode: String = "ask", // "ask" | "allow-routine" | "allow-everything"
    val fullControlEnabled: Boolean = false,
    val confirmHighRiskSpoken: Boolean = true,
    val memoryEnabled: Boolean = false,
    val contextScannerEnabled: Boolean = false,
    val hasAudioPermission: Boolean = false,
    val hasNotificationPermission: Boolean = false,
    val hasOverlayPermission: Boolean = false,
    val isAccessibilityConnected: Boolean = false,
    val isAccessibilityEnabled: Boolean = false,
    val isAdvancedControlAvailable: Boolean = false,
    val isForegroundSessionActive: Boolean = false,
    val batteryPercent: Int = 0,
    val systemVolume: Int = 75,
    val activeLeaseOwner: String? = null,
    val serverBaseUrl: String = "https://hub-mind.netlify.app",
    val testActionResult: String? = null,
    val actionHistory: List<AndroidActionResult> = emptyList(),
    val sessionNotice: String? = null
)

class SettingsViewModel(
    private val authRepository: AuthRepository,
    private val permissionStatusRepository: PermissionStatusRepository,
    private val androidAgentController: AndroidAgentController,
    private val jessRepository: JessRepository,
    context: Context
) : ViewModel() {

    private val actionExecutor = AndroidUiActionExecutor(context)
    private val advancedProvider: AdvancedDeviceControlProvider = ShizukuDeviceControlProvider()

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            authRepository.currentUser.collect { user ->
                _uiState.value = _uiState.value.copy(user = user)
            }
        }

        viewModelScope.launch {
            permissionStatusRepository.hasRecordAudio.collect { audio ->
                _uiState.value = _uiState.value.copy(hasAudioPermission = audio)
            }
        }

        viewModelScope.launch {
            permissionStatusRepository.hasPostNotifications.collect { notif ->
                _uiState.value = _uiState.value.copy(hasNotificationPermission = notif)
            }
        }

        viewModelScope.launch {
            permissionStatusRepository.hasSystemAlertWindow.collect { overlay ->
                _uiState.value = _uiState.value.copy(hasOverlayPermission = overlay)
            }
        }

        viewModelScope.launch {
            permissionStatusRepository.hasAccessibilityService.collect { acc ->
                _uiState.value = _uiState.value.copy(
                    isAccessibilityEnabled = acc,
                    isAccessibilityConnected = HubMindAccessibilityService.isServiceConnected
                )
            }
        }

        viewModelScope.launch {
            jessRepository.activeLeaseClient.collect { lease ->
                _uiState.value = _uiState.value.copy(activeLeaseOwner = lease)
            }
        }

        viewModelScope.launch {
            HubMindAgentForegroundService.isRunning.collect { running ->
                _uiState.value = _uiState.value.copy(isForegroundSessionActive = running)
            }
        }

        permissionStatusRepository.refresh()
        val bat = androidAgentController.getBatteryLevel()
        val vol = androidAgentController.getSystemAudioVolume()
        _uiState.value = _uiState.value.copy(
            batteryPercent = bat,
            systemVolume = vol,
            isAccessibilityConnected = HubMindAccessibilityService.isServiceConnected,
            isAdvancedControlAvailable = advancedProvider.isAvailable
        )
    }

    fun setPermissionMode(mode: String) {
        _uiState.value = _uiState.value.copy(permissionMode = mode)
    }

    fun toggleFullControl(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(fullControlEnabled = enabled)
    }

    fun toggleSpokenConfirmation(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(confirmHighRiskSpoken = enabled)
    }

    fun toggleMemory(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(memoryEnabled = enabled)
    }

    fun toggleContextScanner(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(contextScannerEnabled = enabled)
    }

    fun refreshPermissions() {
        permissionStatusRepository.refresh()
        _uiState.value = _uiState.value.copy(
            isAccessibilityConnected = HubMindAccessibilityService.isServiceConnected
        )
    }

    fun toggleForegroundSession(context: Context) {
        if (_uiState.value.isForegroundSessionActive) {
            HubMindAgentForegroundService.stopService(context)
            _uiState.value = _uiState.value.copy(sessionNotice = null)
        } else {
            val started = HubMindAgentForegroundService.startService(context)
            _uiState.value = _uiState.value.copy(
                sessionNotice = if (started) null
                    else "Android did not allow the foreground session to start. Check notifications and system settings."
            )
        }
    }

    fun executeTestLocalAction(type: AndroidActionType, params: Map<String, Any> = emptyMap()) {
        viewModelScope.launch {
            val cmd = AndroidCommand(
                actionType = type,
                parameters = params
            )
            val result = actionExecutor.executeCommand(cmd)
            _uiState.value = _uiState.value.copy(
                testActionResult = if (result.success) "SUCCESS: ${result.outputText}" else "ERROR: ${result.error}",
                actionHistory = listOf(result) + _uiState.value.actionHistory.take(10)
            )
        }
    }

    fun setVolume(percent: Int) {
        androidAgentController.setSystemAudioVolume(percent)
        _uiState.value = _uiState.value.copy(systemVolume = percent)
    }

    fun claimExclusiveLease() {
        viewModelScope.launch {
            jessRepository.startVoiceSession()
        }
    }

    fun releaseLease() {
        viewModelScope.launch {
            jessRepository.endVoiceSession()
        }
    }

    fun signOut(onSignedOut: () -> Unit) {
        viewModelScope.launch {
            authRepository.signOut()
            onSignedOut()
        }
    }
}
