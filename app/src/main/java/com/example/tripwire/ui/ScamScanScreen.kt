package com.example.tripwire.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ScamScanScreen(viewModel: ScamScanViewModel) {
    val uiState by viewModel.state.collectAsState()
    val input by viewModel.input.collectAsState()
    val useGenAI by viewModel.useGenAI.collectAsState()

    Column(Modifier.padding(16.dp)) {
        OutlinedTextField(
            value = input,
            onValueChange = { viewModel.input.value = it },
            label = { Text("Paste text message") },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(12.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Button(
                onClick = { viewModel.classify() },
                enabled = uiState !is UiState.Loading
            ) { Text(if (uiState is UiState.Loading) "Classifying…" else "Classify") }

            Spacer(Modifier.width(16.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = useGenAI,
                    onCheckedChange = viewModel::setUseGenAI
                )
                Text("Use GenAI")
            }
        }

        Spacer(Modifier.height(16.dp))

        when (uiState) {
            is UiState.Error -> Text(
                text = (uiState as UiState.Error).message,
                color = MaterialTheme.colorScheme.error
            )
            is UiState.Success -> {
                val s = uiState as UiState.Success
                Text("Verdict: ${s.label} • ${s.raw}")
            }
            else -> {}
        }
    }
}
