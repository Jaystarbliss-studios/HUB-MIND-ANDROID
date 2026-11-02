package com.example.hubmind

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.hubmind.di.ServiceLocator
import com.example.hubmind.ui.components.HubMindBottomBar
import com.example.hubmind.ui.components.HubMindNavDestination
import com.example.hubmind.ui.screens.activity.ActivityScreen
import com.example.hubmind.ui.screens.activity.ActivityViewModel
import com.example.hubmind.ui.screens.auth.AuthScreen
import com.example.hubmind.ui.screens.auth.AuthViewModel
import com.example.hubmind.ui.screens.devices.DevicesScreen
import com.example.hubmind.ui.screens.devices.DevicesViewModel
import com.example.hubmind.ui.screens.home.JessHomeScreen
import com.example.hubmind.ui.screens.home.JessHomeViewModel
import com.example.hubmind.ui.screens.settings.SettingsScreen
import com.example.hubmind.ui.screens.settings.SettingsViewModel
import com.example.hubmind.ui.theme.HubMindTheme
import com.example.hubmind.ui.theme.Slate950

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            HubMindTheme {
                var isAuthenticated by remember { mutableStateOf(true) }
                var currentTab by remember { mutableStateOf(HubMindNavDestination.JESS) }

                if (!isAuthenticated) {
                    val authViewModel = remember {
                        AuthViewModel(ServiceLocator.authRepository)
                    }
                    AuthScreen(
                        viewModel = authViewModel,
                        onAuthSuccess = { isAuthenticated = true }
                    )
                } else {
                    BackHandler(enabled = currentTab != HubMindNavDestination.JESS) {
                        currentTab = HubMindNavDestination.JESS
                    }

                    Scaffold(
                        modifier = Modifier.fillMaxSize(),
                        containerColor = Slate950,
                        bottomBar = {
                            HubMindBottomBar(
                                currentDestination = currentTab,
                                onNavigate = { destination ->
                                    currentTab = destination
                                }
                            )
                        }
                    ) { innerPadding ->
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(innerPadding)
                        ) {
                            when (currentTab) {
                                HubMindNavDestination.JESS -> {
                                    val jessViewModel = remember {
                                        JessHomeViewModel(
                                            jessRepository = ServiceLocator.jessRepository,
                                            conversationRepository = ServiceLocator.conversationRepository,
                                            deviceRegistryRepository = ServiceLocator.deviceRegistryRepository
                                        )
                                    }
                                    JessHomeScreen(viewModel = jessViewModel)
                                }
                                HubMindNavDestination.DEVICES -> {
                                    val devicesViewModel = remember {
                                        DevicesViewModel(
                                            deviceRegistryRepository = ServiceLocator.deviceRegistryRepository
                                        )
                                    }
                                    DevicesScreen(viewModel = devicesViewModel)
                                }
                                HubMindNavDestination.ACTIVITY -> {
                                    val activityViewModel = remember {
                                        ActivityViewModel(
                                            deviceControlRepository = ServiceLocator.deviceControlRepository
                                        )
                                    }
                                    ActivityScreen(viewModel = activityViewModel)
                                }
                                HubMindNavDestination.SETTINGS -> {
                                    val settingsViewModel = remember {
                                        SettingsViewModel(
                                            authRepository = ServiceLocator.authRepository,
                                            permissionStatusRepository = ServiceLocator.permissionStatusRepository,
                                            androidAgentController = ServiceLocator.androidAgentController,
                                            jessRepository = ServiceLocator.jessRepository,
                                            context = applicationContext
                                        )
                                    }
                                    SettingsScreen(
                                        viewModel = settingsViewModel,
                                        onSignOut = { isAuthenticated = false }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
