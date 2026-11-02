package com.example.hubmind.ui.screens.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.hubmind.agent.AndroidActionType
import com.example.hubmind.ui.theme.*

@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = Slate950,
        topBar = {
            Surface(
                color = Slate950,
                modifier = Modifier.fillMaxWidth().statusBarsPadding()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Settings & Android Agent Setup",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = Slate50
                    )
                    Text(
                        text = "Permissions, Accessibility Service, & Phone Automation",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Slate400
                    )
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            // User Profile Card
            state.user?.let { user ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Slate900),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Slate800)
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Teal900.copy(alpha = 0.5f))
                                .border(1.dp, Teal500.copy(alpha = 0.4f), RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Filled.Person, contentDescription = null, tint = Teal400, modifier = Modifier.size(26.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(user.displayName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Slate50)
                                Surface(
                                    shape = RoundedCornerShape(4.dp),
                                    color = Teal500.copy(alpha = 0.15f)
                                ) {
                                    Text(user.role.uppercase(), color = Teal400, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp))
                                }
                            }
                            Text(user.email, style = MaterialTheme.typography.bodySmall, color = Slate400)
                        }
                        IconButton(
                            onClick = { viewModel.signOut(onSignOut) },
                            modifier = Modifier.testTag("sign_out_button")
                        ) {
                            Icon(Icons.Filled.Logout, contentDescription = "Sign Out", tint = Rose400)
                        }
                    }
                }
            }

            // Section: Android Agent Status & Active Control Session
            SettingsSectionHeader(title = "Native Android Device Agent Status")
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Slate900),
                border = androidx.compose.foundation.BorderStroke(1.dp, Slate800)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    // Active Foreground Control Session Toggle
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Active Device Control Session", style = MaterialTheme.typography.titleSmall, color = Slate100, fontWeight = FontWeight.Bold)
                            Text("Keeps a visible Android service active while this session is enabled. Remote control is not connected yet.", style = MaterialTheme.typography.bodySmall, color = Slate400)
                        }
                        Switch(
                            checked = state.isForegroundSessionActive,
                            onCheckedChange = { viewModel.toggleForegroundSession(context) },
                            colors = SwitchDefaults.colors(checkedThumbColor = Teal400, checkedTrackColor = Teal900)
                        )
                    }
                    Text(
                        text = if (state.isAccessibilityConnected) "Accessibility service is currently connected."
                            else if (state.isAccessibilityEnabled) "Permission is enabled; the service is not currently connected."
                            else "Accessibility service is disabled.",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (state.isAccessibilityConnected) Green400 else Amber400
                    )

                    state.sessionNotice?.let { notice ->
                        Text(notice, style = MaterialTheme.typography.bodySmall, color = Amber400)
                    }

                    Divider(color = Slate800, thickness = 1.dp)

                    // Accessibility Service Connection Status
                    PermissionRow(
                        icon = Icons.Filled.AccessibilityNew,
                        title = "Hub-Mind Accessibility Service",
                        subtitle = "Lets Jess inspect permitted UI elements and dispatch user-authorised gestures",
                        isGranted = state.isAccessibilityEnabled
                    )

                    // Guided setup instructions if accessibility is disconnected
                    if (!state.isAccessibilityEnabled) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Amber400.copy(alpha = 0.12f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Amber400.copy(alpha = 0.3f))
                        ) {
                            Text(
                                text = "Enable Hub-Mind Agent in Android Settings > Accessibility > Installed or Downloaded apps. Android will show the system permission screen.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Amber400,
                                modifier = Modifier.padding(10.dp),
                                fontSize = 12.sp
                            )
                        }
                    }

                    Divider(color = Slate800, thickness = 1.dp)

                    // Advanced Control Provider Status (Shizuku / ADB)
                    PermissionRow(
                        icon = Icons.Filled.DeveloperMode,
                        title = "Advanced Control Bridge (Shizuku / ADB)",
                        subtitle = "Optional provider for key event injection and protected system actions",
                        isGranted = state.isAdvancedControlAvailable
                    )
                }
            }

            // Section: Test Local Android Actions
            SettingsSectionHeader(title = "Local Action Test Controls")
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Slate900),
                border = androidx.compose.foundation.BorderStroke(1.dp, Slate800)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Test local automation capabilities directly on this phone:", style = MaterialTheme.typography.bodySmall, color = Slate300)

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { viewModel.executeTestLocalAction(AndroidActionType.GO_HOME) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Slate800)
                        ) {
                            Text("Test Home", fontSize = 11.sp, color = Slate100)
                        }
                        Button(
                            onClick = { viewModel.executeTestLocalAction(AndroidActionType.NAVIGATE_BACK) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Slate800)
                        ) {
                            Text("Test Back", fontSize = 11.sp, color = Slate100)
                        }
                        Button(
                            onClick = { viewModel.executeTestLocalAction(AndroidActionType.OPEN_RECENTS) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Slate800)
                        ) {
                            Text("Recents", fontSize = 11.sp, color = Slate100)
                        }
                    }

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { viewModel.executeTestLocalAction(AndroidActionType.GET_INSTALLED_APPS) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Slate800)
                        ) {
                            Text("Installed Apps", fontSize = 11.sp, color = Teal400)
                        }
                        Button(
                            onClick = { viewModel.executeTestLocalAction(AndroidActionType.GET_SCREEN_HIERARCHY) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Slate800)
                        ) {
                            Text("Dump Hierarchy", fontSize = 11.sp, color = Teal400)
                        }
                    }

                    // Test Action Result Banner
                    state.testActionResult?.let { resultText ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Slate950,
                            border = androidx.compose.foundation.BorderStroke(1.dp, Slate800)
                        ) {
                            Text(
                                text = resultText,
                                style = MaterialTheme.typography.bodySmall,
                                color = if (resultText.startsWith("SUCCESS")) Green400 else Rose400,
                                modifier = Modifier.padding(10.dp),
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }

            // Cross-device transport is intentionally not advertised as active until
            // the authenticated relay and Windows receiver are implemented.
            SettingsSectionHeader(title = "Cross-Device Connection")
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Slate900),
                border = androidx.compose.foundation.BorderStroke(1.dp, Slate800)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Filled.Devices, contentDescription = null, tint = Amber400)
                        Text("Windows connection not configured", color = Slate100, fontWeight = FontWeight.SemiBold)
                    }
                    Text(
                        "This build currently reports this Android phone only. The authenticated device registry, live command relay and Windows agent receiver still need to be connected. Remote commands will be rejected rather than simulated.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Slate400
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
fun SettingsSectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelLarge,
        color = Teal400,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.5.sp
    )
}

@Composable
fun PermissionRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    isGranted: Boolean
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(modifier = Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(icon, contentDescription = null, tint = if (isGranted) Teal400 else Slate500, modifier = Modifier.size(22.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleSmall, color = Slate100, fontWeight = FontWeight.SemiBold)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Slate400)
            }
        }
        Surface(
            shape = RoundedCornerShape(6.dp),
            color = if (isGranted) Green400.copy(alpha = 0.15f) else Amber400.copy(alpha = 0.15f)
        ) {
            Text(
                text = if (isGranted) "Granted" else "Requires Setup",
                color = if (isGranted) Green400 else Amber400,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
            )
        }
    }
}

