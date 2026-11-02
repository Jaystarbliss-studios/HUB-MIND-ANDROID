package com.example.hubmind.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.hubmind.data.model.JessLiveState
import com.example.hubmind.ui.theme.*
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun JessOrbView(
    state: JessLiveState,
    modifier: Modifier = Modifier,
    size: Dp = 140.dp,
    onClick: () -> Unit = {}
) {
    val infiniteTransition = rememberInfiniteTransition(label = "jess_orb_transition")

    // Breathing pulse
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 0.88f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = when (state) {
                    JessLiveState.LISTENING -> 800
                    JessLiveState.THINKING -> 1100
                    JessLiveState.SPEAKING -> 600
                    JessLiveState.ERROR -> 500
                    else -> 2400
                },
                easing = FastOutSlowInEasing
            ),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_scale"
    )

    // Orbital angle for thinking ring
    val orbitAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 3500, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "orbit_angle"
    )

    // Glow alpha
    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.85f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1500, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glow_alpha"
    )

    val coreColor = when (state) {
        JessLiveState.LISTENING -> Cyan400
        JessLiveState.THINKING -> Teal400
        JessLiveState.SPEAKING -> Teal400
        JessLiveState.ERROR -> Rose400
        JessLiveState.MUTED -> Slate500
        else -> Teal500
    }

    val outerGlowColor = when (state) {
        JessLiveState.LISTENING -> Cyan400.copy(alpha = glowAlpha)
        JessLiveState.THINKING -> Teal400.copy(alpha = glowAlpha)
        JessLiveState.SPEAKING -> Green400.copy(alpha = glowAlpha)
        JessLiveState.ERROR -> Rose400.copy(alpha = glowAlpha)
        JessLiveState.MUTED -> Slate700.copy(alpha = 0.2f)
        else -> Teal500.copy(alpha = glowAlpha * 0.5f)
    }

    Box(
        modifier = modifier
            .size(size)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.size(size)) {
            val center = Offset(size.toPx() / 2f, size.toPx() / 2f)
            val baseRadius = (size.toPx() / 2f) * 0.55f

            // 1. Outermost Ambient Glow
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(outerGlowColor, Color.Transparent),
                    center = center,
                    radius = baseRadius * 1.6f * pulseScale
                ),
                radius = baseRadius * 1.6f * pulseScale,
                center = center
            )

            // 2. Outer Orbit Ring
            drawCircle(
                color = coreColor.copy(alpha = 0.4f),
                radius = baseRadius * 1.25f,
                center = center,
                style = Stroke(width = 2.dp.toPx())
            )

            // 3. Orbital Satellite Particle
            val rad = Math.toRadians(orbitAngle.toDouble())
            val orbitRadius = baseRadius * 1.25f
            val satX = center.x + (orbitRadius * cos(rad)).toFloat()
            val satY = center.y + (orbitRadius * sin(rad)).toFloat()
            drawCircle(
                color = coreColor,
                radius = 4.dp.toPx(),
                center = Offset(satX, satY)
            )

            // 4. Inner Radiant Core
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color.White,
                        coreColor,
                        Slate900
                    ),
                    center = center,
                    radius = baseRadius * pulseScale
                ),
                radius = baseRadius * pulseScale,
                center = center
            )

            // 5. Center Bright Sparkle
            drawCircle(
                color = Color.White.copy(alpha = 0.9f),
                radius = 5.dp.toPx(),
                center = center
            )
        }
    }
}
