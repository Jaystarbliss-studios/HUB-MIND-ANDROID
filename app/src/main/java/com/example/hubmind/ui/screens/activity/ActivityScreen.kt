package com.example.hubmind.ui.screens.activity

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.hubmind.data.model.ActivityRecord
import com.example.hubmind.data.model.CommandStatus
import com.example.hubmind.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun ActivityScreen(
    viewModel: ActivityViewModel,
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
                        text = "Activity Timeline",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = Slate50
                    )
                    Text(
                        text = "Cross-device execution trace & verification audit",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Slate400
                    )
                }
            }
        }
    ) { innerPadding ->
        if (state.records.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                Text("No recent activity records.", color = Slate500)
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                items(state.records) { record ->
                    ActivityItemCard(record = record)
                }
                item {
                    Spacer(modifier = Modifier.height(20.dp))
                }
            }
        }
    }
}

@Composable
fun ActivityItemCard(
    record: ActivityRecord,
    modifier: Modifier = Modifier
) {
    val dateStr = remember(record.timestamp) {
        val sdf = SimpleDateFormat("h:mm a · MMM d", Locale.getDefault())
        sdf.format(Date(record.timestamp))
    }

    val (statusColor, statusIcon) = when (record.status) {
        CommandStatus.COMPLETED -> Pair(Green400, Icons.Filled.CheckCircle)
        CommandStatus.RUNNING -> Pair(Cyan400, Icons.Filled.Sync)
        CommandStatus.FAILED -> Pair(Rose400, Icons.Filled.Error)
        CommandStatus.CANCELLED -> Pair(Slate400, Icons.Filled.Cancel)
        else -> Pair(Amber400, Icons.Filled.HourglassTop)
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .border(1.dp, Slate800, RoundedCornerShape(14.dp)),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Slate900)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = statusIcon,
                        contentDescription = null,
                        tint = statusColor,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = record.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = Slate100
                    )
                }
                Text(
                    text = "${record.durationMs}ms",
                    style = MaterialTheme.typography.labelSmall,
                    color = Slate400,
                    fontSize = 11.sp
                )
            }

            Text(
                text = record.details,
                style = MaterialTheme.typography.bodySmall,
                color = Slate300,
                lineHeight = 18.sp
            )

            Divider(color = Slate800, thickness = 1.dp)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Devices,
                        contentDescription = null,
                        tint = Slate400,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = record.targetDevice,
                        style = MaterialTheme.typography.labelSmall,
                        color = Slate400
                    )
                    if (record.verified) {
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = Green400.copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = "Verified Postcondition",
                                color = Green400,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                            )
                        }
                    }
                }
                Text(
                    text = dateStr,
                    style = MaterialTheme.typography.labelSmall,
                    color = Slate500,
                    fontSize = 11.sp
                )
            }
        }
    }
}
