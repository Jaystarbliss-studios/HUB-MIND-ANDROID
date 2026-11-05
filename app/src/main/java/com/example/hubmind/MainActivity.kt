package com.example.hubmind

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.example.hubmind.di.ServiceLocator
import com.example.hubmind.ui.components.HubMindBottomBar
import com.example.hubmind.ui.components.HubMindNavDestination
import com.example.hubmind.ui.screens.activity.ActivityScreen
import com.example.hubmind.ui.screens.activity.ActivityViewModel
import com.example.hubmind.ui.screens.devices.DevicesScreen
import com.example.hubmind.ui.screens.devices.DevicesViewModel
import com.example.hubmind.ui.screens.settings.SettingsScreen
import com.example.hubmind.ui.screens.settings.SettingsViewModel
import com.example.hubmind.ui.screens.workspace.WorkspaceScreen
import com.example.hubmind.ui.theme.HubMindTheme
import com.example.hubmind.ui.theme.Slate950

/**
 * The web workspace is the primary Hub-Mind Android experience.
 *
 * It is intentionally kept mounted while native device screens are shown so
 * the website's Firebase session, open document, autosave state and Jess Live
 * session are not discarded when the user opens Android device controls.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            HubMindTheme {
                var currentTab by remember {
                    mutableStateOf(HubMindNavDestination.WORKSPACE)
                }

                BackHandler(enabled = currentTab != HubMindNavDestination.WORKSPACE) {
                    currentTab = HubMindNavDestination.WORKSPACE
                }

                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    containerColor = Slate950,
                    bottomBar = {
                        if (currentTab != HubMindNavDestination.WORKSPACE) {
                            HubMindBottomBar(
                                currentDestination = currentTab,
                                onNavigate = { destination -> currentTab = destination }
                            )
                        }
                    }
                ) { innerPadding ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                    ) {
                        // Keep the exact responsive Hub-Mind web workspace alive
                        // underneath native tools. This also keeps Jess's browser
                        // audio session and the active document editor mounted.
                        WorkspaceScreen(
                            modifier = Modifier.fillMaxSize(),
                            isVisible = currentTab == HubMindNavDestination.WORKSPACE,
                            onOpenDeviceControls = {
                                currentTab = HubMindNavDestination.DEVICES
                            }
                        )

                        if (currentTab != HubMindNavDestination.WORKSPACE) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(Slate950)
                            ) {
                                when (currentTab) {
                                    HubMindNavDestination.WORKSPACE -> Unit

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
                                            // The website owns the real Firebase session.
                                            // Native preferences must not pretend to sign
                                            // the user out of the web workspace.
                                            onSignOut = {
                                                currentTab = HubMindNavDestination.WORKSPACE
                                            }
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
}
