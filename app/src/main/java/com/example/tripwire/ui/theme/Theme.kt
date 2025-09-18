package com.example.tripwire.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// ---- TripWire dark color palette (tweak as you like) ----
private val TripWireDarkColors = darkColorScheme(
    primary = Color(0xFFB39DDB),      // lavender-ish (button, accents)
    onPrimary = Color(0xFF000000),

    secondary = Color(0xFFCE93D8),
    onSecondary = Color(0xFF000000),

    background = Color(0xFF121212),   // near-black background
    onBackground = Color(0xFFEDE7F6),

    surface = Color(0xFF1A1A1A),      // cards, text fields
    onSurface = Color(0xFFEDE7F6),

    error = Color(0xFFFF8A80),
    onError = Color(0xFF000000)
)

// You can customize Typography() if you have fonts; default is fine.
private val TripWireTypography = Typography()

@Composable
fun TripWireTheme(
    content: @Composable () -> Unit
) {
    // Force dark theme (ignore system setting)
    MaterialTheme(
        colorScheme = TripWireDarkColors,
        typography = TripWireTypography,
        content = content
    )
}
