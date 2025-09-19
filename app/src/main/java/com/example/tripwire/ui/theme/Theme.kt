package com.example.tripwire.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val scheme = darkColorScheme(
    primary = LavenderPrimary,
    onPrimary = Color(0xFF230744),
    secondary = LavenderSecondary,
    onSecondary = Color(0xFF1C0A38),
    tertiary = LavenderTertiary,
    onTertiary = Color(0xFF2A103E),
    background = NightSky,
    onBackground = OnDark,
    surface = DeepSurface,
    onSurface = OnDark,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = LavenderTertiary,
    outline = OutlineLavender,
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005)
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = Typography, content = content)
}
