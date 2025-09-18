// MainActivity.kt
package com.example.tripwire

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.tripwire.ui.ScamScanScreen
import com.example.tripwire.ui.ScamScanViewModel
import com.example.tripwire.ui.theme.TripWireTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Startup log (optional)
        Log.d(
            "TripWireMain",
            "Startup → PROXY_BASE_URL='${BuildConfig.PROXY_BASE_URL}', " +
                    "GEMINI.len=${BuildConfig.GEMINI_API_KEY.length}, LOGGING=${BuildConfig.LOGGING}"
        )

        setContent {
            TripWireTheme {
                // ✅ Create the VM via Compose helper and your factory
                val vm: ScamScanViewModel = viewModel(factory = ScamScanViewModel.factory())
                ScamScanScreen(vm)
            }
        }
    }
}
