package com.example.hubmind.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.hubmind.data.model.DeviceNode
import com.example.hubmind.data.model.DeviceStatus
import com.example.hubmind.ui.theme.*

enum class HubMindNavDestination(
    val title: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
    val testTag: String
) {
    JESS("Jess", Icons.Filled.SmartToy, Icons.Outlined.SmartToy, "nav_jess_tab"),
    DEVICES("Devices", Icons.Filled.Devices, Icons.Outlined.Devices, "nav_devices_tab"),
    ACTIVITY("Activity", Icons.Filled.History, Icons.Outlined.History, "nav_activity_tab"),
    SETTINGS("Settings", Icons.Filled.Settings, Icons.Outlined.Settings, "nav_settings_tab")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HubMindTopBar(
    targetDevice: DeviceNode?,
    onSwitchDeviceClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Slate950,
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Brand & Logo
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Slate900)
                        .border(1.dp, Teal500.copy(alpha = 0.5f), RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.Hub,
                        contentDescription = "Hub-Mind Logo",
                        tint = Teal400,
                        modifier = Modifier.size(20.dp)
                    )
                }
                Column {
                    Text(
                        text = "Hub-Mind",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Slate50
                    )
                    Text(
                        text = "Jaystarbliss Studios",
                        style = MaterialTheme.typography.labelSmall,
                        color = Slate400
                    )
                }
            }

            // Target Device Indicator Chip
            Surface(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .clickable(onClick = onSwitchDeviceClick)
                    .testTag("target_device_chip"),
                color = Slate900,
                border = androidx.compose.foundation.BorderStroke(1.dp, Slate800)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(if (targetDevice?.status == DeviceStatus.ONLINE) Green400 else Slate500)
                    )
                    Text(
                        text = targetDevice?.deviceName?.take(18) ?: "Local Phone",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = Slate200
                    )
                    Icon(
                        imageVector = Icons.Filled.ArrowDropDown,
                        contentDescription = "Switch Target Device",
                        tint = Slate400,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun HubMindBottomBar(
    currentDestination: HubMindNavDestination,
    onNavigate: (HubMindNavDestination) -> Unit,
    modifier: Modifier = Modifier
) {
    NavigationBar(
        modifier = modifier.testTag("bottom_navigation_bar"),
        containerColor = Slate950,
        contentColor = Slate300,
        tonalElevation = 4.dp
    ) {
        HubMindNavDestination.entries.forEach { dest ->
            val selected = currentDestination == dest
            NavigationBarItem(
                selected = selected,
                onClick = { onNavigate(dest) },
                icon = {
                    Icon(
                        imageVector = if (selected) dest.selectedIcon else dest.unselectedIcon,
                        contentDescription = dest.title,
                        tint = if (selected) Teal400 else Slate400
                    )
                },
                label = {
                    Text(
                        text = dest.title,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        color = if (selected) Teal400 else Slate400
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    indicatorColor = Slate900,
                    selectedIconColor = Teal400,
                    unselectedIconColor = Slate400
                ),
                modifier = Modifier.testTag(dest.testTag)
            )
        }
    }
}

@Composable
fun StatusBadge(
    status: DeviceStatus,
    modifier: Modifier = Modifier
) {
    val (bgColor, textColor, text) = when (status) {
        DeviceStatus.ONLINE -> Triple(Green400.copy(alpha = 0.15f), Green400, "Online")
        DeviceStatus.BUSY -> Triple(Amber400.copy(alpha = 0.15f), Amber400, "Busy")
        DeviceStatus.OFFLINE -> Triple(Slate800, Slate400, "Offline")
        DeviceStatus.UNAVAILABLE -> Triple(Rose400.copy(alpha = 0.15f), Rose400, "Unavailable")
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(bgColor)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(5.dp)
                    .clip(CircleShape)
                    .background(textColor)
            )
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall,
                color = textColor,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}
