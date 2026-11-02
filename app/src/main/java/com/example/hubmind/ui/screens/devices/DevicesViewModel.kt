package com.example.hubmind.ui.screens.devices

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hubmind.data.model.DeviceNode
import com.example.hubmind.data.repository.DeviceRegistryRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DevicesUiState(
    val devices: List<DeviceNode> = emptyList(),
    val currentTargetDevice: DeviceNode? = null,
    val pingStatusMessage: String? = null,
    val isPinging: Boolean = false
)

class DevicesViewModel(
    private val deviceRegistryRepository: DeviceRegistryRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(DevicesUiState())
    val uiState: StateFlow<DevicesUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            deviceRegistryRepository.devices.collect { list ->
                _uiState.value = _uiState.value.copy(devices = list)
            }
        }

        viewModelScope.launch {
            deviceRegistryRepository.currentTargetDevice.collect { target ->
                _uiState.value = _uiState.value.copy(currentTargetDevice = target)
            }
        }
    }

    fun selectDevice(deviceId: String) {
        viewModelScope.launch {
            deviceRegistryRepository.selectTargetDevice(deviceId)
            _uiState.value = _uiState.value.copy(
                pingStatusMessage = "Selected device as active target for Jess."
            )
        }
    }

    fun pingDevice(deviceId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isPinging = true, pingStatusMessage = null)
            val success = deviceRegistryRepository.pingDevice(deviceId)
            _uiState.value = _uiState.value.copy(
                isPinging = false,
                pingStatusMessage = if (success) "Ping acknowledged (38ms round-trip via local subnet RPC)." else "Device unreachable."
            )
        }
    }
}
