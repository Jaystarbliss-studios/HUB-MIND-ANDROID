package com.example.hubmind.ui.screens.devices

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.hubmind.data.model.DeviceCapability
import com.example.hubmind.data.model.DeviceNode
import com.example.hubmind.data.model.DevicePlatform
import com.example.hubmind.ui.components.StatusBadge
import com.example.hubmind.ui.theme.*

@Composable
fun DevicesScreen(
    viewModel: DevicesViewModel,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsState()

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
                        text = "Connected Devices",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = Slate50
                    )
                    Text(
                        text = "Authorized nodes in the Jaystarbliss Studios device mesh",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Slate400
                    )
                }
            }
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Ping feedback banner if present
            state.pingStatusMessage?.let { msg ->
                item {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Slate900,
                        border = androidx.compose.foundation.BorderStroke(1.dp, Teal500.copy(alpha = 0.5f))
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Filled.Check, contentDescription = null, tint = Green400)
                            Text(text = msg, style = MaterialTheme.typography.bodySmall, color = Slate200)
                        }
                    }
                }
            }

            items(state.devices) { device ->
                DeviceCard(
                    device = device,
                    isSelectedTarget = state.currentTargetDevice?.deviceId == device.deviceId,
                    onSelect = { viewModel.selectDevice(device.deviceId) },
                    onPing = { viewModel.pingDevice(device.deviceId) },
                    isPinging = state.isPinging
                )
            }

            item {
                Spacer(modifier = Modifier.height(24.dp))
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Slate900.copy(alpha = 0.6f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Slate800)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Filled.Shield, contentDescription = null, tint = Teal400, modifier = Modifier.size(18.dp))
                            Text("Private Device Security", style = MaterialTheme.typography.titleSmall, color = Slate100, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Direct Win32 execution requires active Full Control Session on the desktop. Commands are routed via private Firestore queue or mDNS local subnet bridge.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Slate400,
                            lineHeight = 17.sp
                        )
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DeviceCard(
    device: DeviceNode,
    isSelectedTarget: Boolean,
    onSelect: () -> Unit,
    onPing: () -> Unit,
    isPinging: Boolean,
    modifier: Modifier = Modifier
) {
    val isWindows = device.platform == DevicePlatform.WINDOWS

    Card(
        modifier = modifier
            .fillMaxWidth()
            .border(
                width = if (isSelectedTarget) 1.5.dp else 1.dp,
                color = if (isSelectedTarget) Teal400 else Slate800,
                shape = RoundedCornerShape(16.dp)
            ),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Slate900)
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Header: Icon, Name, Status Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (isWindows) Teal900.copy(alpha = 0.4f) else Slate800)
                            .border(1.dp, if (isWindows) Teal500.copy(alpha = 0.4f) else Slate700, RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (isWindows) Icons.Filled.LaptopWindows else Icons.Filled.Smartphone,
                            contentDescription = device.deviceName,
                            tint = if (isWindows) Teal400 else Cyan400,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                text = device.deviceName,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Slate50
                            )
                            if (device.isCurrentDevice) {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = Teal500.copy(alpha = 0.15f)
                                ) {
                                    Text("This Phone", color = Teal400, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp))
                                }
                            }
                        }
                        Text(
                            text = "${device.platform.name} · v${device.clientVersion} · ${device.ipAddress ?: "Subnet"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Slate400
                        )
                    }
                }
                StatusBadge(status = device.status)
            }

            // Telemetry Specs
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                device.batteryPercent?.let { bat ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Filled.BatteryStd, contentDescription = "Battery", tint = Green400, modifier = Modifier.size(16.dp))
                        Text("$bat%", style = MaterialTheme.typography.labelSmall, color = Slate300)
                    }
                }
                if (isWindows) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Filled.LockOpen, contentDescription = "Full Control", tint = Teal400, modifier = Modifier.size(16.dp))
                        Text(if (device.fullControlActive) "Full Control Active" else "Standard Mode", style = MaterialTheme.typography.labelSmall, color = Slate300)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Filled.Rule, contentDescription = "Mode", tint = Cyan400, modifier = Modifier.size(16.dp))
                        Text(device.permissionMode, style = MaterialTheme.typography.labelSmall, color = Slate300)
                    }
                }
            }

            // Capability Tags
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Registered Capabilities:", style = MaterialTheme.typography.labelSmall, color = Slate400)
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    device.capabilities.take(6).forEach { cap ->
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = Slate950,
                            border = androidx.compose.foundation.BorderStroke(1.dp, Slate800)
                        ) {
                            Text(
                                text = cap.name.lowercase().replace('_', ' '),
                                color = Slate300,
                                fontSize = 10.sp,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                            )
                        }
                    }
                }
            }

            Divider(color = Slate800, thickness = 1.dp)

            // Action Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    onClick = onPing,
                    enabled = !isPinging,
                    modifier = Modifier.weight(1f).testTag("ping_device_button"),
                    shape = RoundedCornerShape(10.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Slate700)
                ) {
                    Icon(Icons.Filled.NetworkPing, contentDescription = null, tint = Slate300, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Ping Agent", color = Slate200, fontSize = 13.sp)
                }

                Button(
                    onClick = onSelect,
                    modifier = Modifier.weight(1f).testTag("select_target_device_button"),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isSelectedTarget) Teal600 else Slate800,
                        contentColor = if (isSelectedTarget) Slate950 else Slate100
                    )
                ) {
                    Text(if (isSelectedTarget) "Target Active" else "Select Target", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                }
            }
        }
    }
}
