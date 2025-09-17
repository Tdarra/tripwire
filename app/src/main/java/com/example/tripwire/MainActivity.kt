package com.example.tripwire

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.tripwire.ui.ScamScanScreen
import com.example.tripwire.ui.ScamScanViewModel
import com.example.tripwire.ui.theme.AppTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // MainActivity.onCreate()
        if (BuildConfig.LOGGING) {
            Log.d("TripWireMain", "API key present? ${BuildConfig.GEMINI_API_KEY.isNotBlank()} (len=${BuildConfig.GEMINI_API_KEY.length})")
        }

        super.onCreate(savedInstanceState)
        setContent {
            AppTheme {
                val vm: ScamScanViewModel = viewModel(
                    factory = ScamScanViewModel.factory()
                )
                ScamScanScreen(vm)
            }
        }
    }
}
