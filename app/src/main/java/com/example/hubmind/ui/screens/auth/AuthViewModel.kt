package com.example.hubmind.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hubmind.data.model.User
import com.example.hubmind.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val user: User? = null
)

class AuthViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        authRepository.configurationError?.let { configurationMessage ->
            _uiState.value = _uiState.value.copy(errorMessage = configurationMessage)
        }
        viewModelScope.launch {
            authRepository.currentUser.collect { user ->
                _uiState.value = _uiState.value.copy(user = user)
            }
        }
    }

    fun onEmailChange(newEmail: String) {
        _uiState.value = _uiState.value.copy(email = newEmail, errorMessage = null)
    }

    fun onPasswordChange(newPassword: String) {
        _uiState.value = _uiState.value.copy(password = newPassword, errorMessage = null)
    }

    fun signIn() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            val result = authRepository.signIn(_uiState.value.email, _uiState.value.password)
            result.fold(
                onSuccess = { user ->
                    _uiState.value = _uiState.value.copy(isLoading = false, user = user)
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "Authentication failed."
                    )
                }
            )
        }
    }

    fun signInWithGoogle() {
        _uiState.value = _uiState.value.copy(
            errorMessage = "Google sign-in is not connected in this Android build yet. Use email and password until Android OAuth is configured."
        )
    }
}
