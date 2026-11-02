package com.example.hubmind.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val HubMindColorScheme = darkColorScheme(
    primary = Teal400,
    onPrimary = Slate950,
    primaryContainer = Teal900,
    onPrimaryContainer = Teal400,
    secondary = Cyan400,
    onSecondary = Slate950,
    background = Slate950,
    onBackground = Slate100,
    surface = Slate900,
    onSurface = Slate100,
    surfaceVariant = Slate800,
    onSurfaceVariant = Slate300,
    outline = Slate700,
    error = Rose400,
    onError = Slate950
)

@Composable
fun HubMindTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    // Hub-Mind maintains its established dark workspace palette
    MaterialTheme(
        colorScheme = HubMindColorScheme,
        typography = Typography,
        content = content
    )
}
