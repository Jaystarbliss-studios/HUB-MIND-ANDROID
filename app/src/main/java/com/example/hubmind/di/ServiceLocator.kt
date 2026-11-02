package com.example.hubmind.di

import android.content.Context
import com.example.hubmind.data.repository.*

object ServiceLocator {
    private var appContext: Context? = null

    fun initialize(context: Context) {
        appContext = context.applicationContext
    }

    val authRepository: AuthRepository by lazy {
        AuthRepositoryImpl(requireNotNull(appContext))
    }

    val conversationRepository: ConversationRepository by lazy {
        ConversationRepositoryImpl()
    }

    val deviceRegistryRepository: DeviceRegistryRepository by lazy {
        DeviceRegistryRepositoryImpl(requireNotNull(appContext))
    }

    val deviceControlRepository: DeviceControlRepository by lazy {
        DeviceControlRepositoryImpl(emptyList())
    }

    val jessRepository: JessRepository by lazy {
        JessRepositoryImpl(
            conversationRepository = conversationRepository,
            deviceControlRepository = deviceControlRepository,
            deviceRegistryRepository = deviceRegistryRepository
        )
    }

    val androidAgentController: AndroidAgentController by lazy {
        AndroidAgentControllerImpl(requireNotNull(appContext))
    }

    val permissionStatusRepository: PermissionStatusRepository by lazy {
        PermissionStatusRepositoryImpl()
    }

    val voiceInteractionRepository: VoiceInteractionRepository by lazy {
        VoiceInteractionRepositoryImpl()
    }
}
