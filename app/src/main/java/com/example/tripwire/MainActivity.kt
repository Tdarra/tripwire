package com.example.tripwire

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.tripwire.ui.ScamScanScreen
import com.example.tripwire.ui.ScamScanViewModel
import com.example.tripwire.ui.theme.AppTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
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
