package com.example.hubmind

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.hubmind.di.AppBootstrapState
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
import com.example.hubmind.ui.theme.Slate50
import com.example.hubmind.ui.theme.Slate400
import com.example.hubmind.ui.theme.Teal400

class MainActivity : ComponentActivity() {
    override fun onResume() {
        super.onResume()
        if (ServiceLocator.bootstrapState.value == AppBootstrapState.Ready) {
            runCatching {
                ServiceLocator.permissionStatusRepository.refresh()
                lifecycleScope.launch {
                    ServiceLocator.deviceRegistryRepository.refreshDevices()
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            HubMindTheme {
                val bootstrapState by ServiceLocator.bootstrapState.collectAsState()

                when (val state = bootstrapState) {
                    AppBootstrapState.Loading -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                CircularProgressIndicator(color = Teal400)
                                Spacer(Modifier.height(16.dp))
                                Text("Connecting to Hub-Mind…", color = Slate50)
                                Text("Loading your shared Firebase configuration", color = Slate400)
                            }
                        }
                    }
                    is AppBootstrapState.Failed -> {
                        Column(
                            modifier = Modifier.fillMaxSize().padding(28.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Text("Hub-Mind could not connect", color = Slate50, style = MaterialTheme.typography.titleLarge)
                            Spacer(Modifier.height(12.dp))
                            Text(state.message, color = Slate400)
                            Spacer(Modifier.height(20.dp))
                            Button(onClick = ServiceLocator::retryInitialization) {
                                Text("Retry connection")
                            }
                        }
                    }
                    AppBootstrapState.Ready -> {
                        val authRepository = ServiceLocator.authRepository
                        val signedInUser by authRepository.currentUser.collectAsState()
                        val authViewModel = remember { AuthViewModel(authRepository) }
                        var currentTab by remember { mutableStateOf(HubMindNavDestination.JESS) }

                        if (signedInUser == null) {
                            AuthScreen(viewModel = authViewModel)
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
                                        onNavigate = { destination -> currentTab = destination }
                                    )
                                }
                            ) { innerPadding ->
                                Box(
                                    modifier = Modifier.fillMaxSize().padding(innerPadding)
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
                                                DevicesViewModel(ServiceLocator.deviceRegistryRepository)
                                            }
                                            DevicesScreen(viewModel = devicesViewModel)
                                        }
                                        HubMindNavDestination.ACTIVITY -> {
                                            val activityViewModel = remember {
                                                ActivityViewModel(ServiceLocator.deviceControlRepository)
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
                                                onSignOut = { /* auth state drives navigation back to sign-in */ }
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
}
