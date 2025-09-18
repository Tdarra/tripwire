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

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        OutlinedTextField(
            value = input,
            onValueChange = { viewModel.input.value = it },
            label = { Text("Paste a message to check") },
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 160.dp),            // ⬅ bigger box
            singleLine = false,
            maxLines = 8
        )

        Spacer(Modifier.height(20.dp))

        // Row with button on the right and checkbox just to its left
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Spacer(Modifier.weight(1f))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = useGenAI, onCheckedChange = viewModel::setUseGenAI)
                Text("Use GenAI")
                Spacer(Modifier.width(12.dp))
                Button(
                    onClick = { viewModel.classify() },
                    enabled = uiState !is UiState.Loading
                ) {
                    Text(if (uiState is UiState.Loading) "Classifying…" else "Classify")
                }
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

