package com.example.hubmind.ui.screens.activity

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hubmind.data.model.ActivityRecord
import com.example.hubmind.data.repository.DeviceControlRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ActivityUiState(
    val records: List<ActivityRecord> = emptyList(),
    val filterTarget: String? = null
)

class ActivityViewModel(
    private val deviceControlRepository: DeviceControlRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ActivityUiState())
    val uiState: StateFlow<ActivityUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            deviceControlRepository.activityRecords.collect { list ->
                _uiState.value = _uiState.value.copy(records = list)
            }
        }
    }
}
