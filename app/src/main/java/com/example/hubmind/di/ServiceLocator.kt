package com.example.hubmind.di

import android.content.Context
import com.example.hubmind.data.HubMindRuntime
import com.example.hubmind.data.repository.*
import com.google.firebase.FirebaseApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AppBootstrapState {
    data object Loading : AppBootstrapState
    data object Ready : AppBootstrapState
    data class Failed(val message: String) : AppBootstrapState
}

object ServiceLocator {
    private var appContext: Context? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _bootstrapState = MutableStateFlow<AppBootstrapState>(AppBootstrapState.Loading)
    val bootstrapState: StateFlow<AppBootstrapState> = _bootstrapState.asStateFlow()

    fun initialize(context: Context) {
        appContext = context.applicationContext
        initializeBackend()
    }

    fun retryInitialization() {
        if (appContext != null) initializeBackend()
    }

    private fun initializeBackend() {
        val context = appContext ?: return
        _bootstrapState.value = AppBootstrapState.Loading
        scope.launch {
            try {
                HubMindRuntime.loadAndInitializeFirebase(context)
                check(FirebaseApp.getApps(context).isNotEmpty()) {
                    "Firebase could not be initialized for Hub-Mind Android."
                }
                _bootstrapState.value = AppBootstrapState.Ready
            } catch (error: Exception) {
                _bootstrapState.value = AppBootstrapState.Failed(
                    error.message ?: "Hub-Mind could not connect to its backend configuration."
                )
            }
        }
    }

    val authRepository: AuthRepository by lazy {
        AuthRepositoryImpl(requireNotNull(appContext))
    }

    val conversationRepository: ConversationRepository by lazy {
        FirestoreConversationRepositoryImpl(requireNotNull(appContext), authRepository)
    }

    val deviceRegistryRepository: DeviceRegistryRepository by lazy {
        DeviceRegistryRepositoryImpl(requireNotNull(appContext))
    }

    val deviceControlRepository: DeviceControlRepository by lazy {
        DeviceControlRepositoryImpl(emptyList(), deviceRegistryRepository)
    }

    val jessRepository: JessRepository by lazy {
        JessRepositoryImpl(
            conversationRepository = conversationRepository,
            authRepository = authRepository,
            deviceControlRepository = deviceControlRepository,
            deviceRegistryRepository = deviceRegistryRepository
        )
    }

    val androidAgentController: AndroidAgentController by lazy {
        AndroidAgentControllerImpl(requireNotNull(appContext))
    }

    val permissionStatusRepository: PermissionStatusRepository by lazy {
        PermissionStatusRepositoryImpl(requireNotNull(appContext))
    }

    val voiceInteractionRepository: VoiceInteractionRepository by lazy {
        VoiceInteractionRepositoryImpl()
    }
}
