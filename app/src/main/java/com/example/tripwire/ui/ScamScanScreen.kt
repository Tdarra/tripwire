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

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            shape = MaterialTheme.shapes.medium,
            tonalElevation = 6.dp,
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 520.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp)
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { viewModel.input.value = it },
                    label = { Text("Paste a message to check") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 160.dp),
                    singleLine = false,
                    maxLines = 8
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(checked = useGenAI, onCheckedChange = viewModel::setUseGenAI)
                    Spacer(Modifier.width(8.dp))
                    Text("Use GenAI")
                    Spacer(Modifier.width(12.dp))
                    Button(
                        onClick = { viewModel.classify() },
                        enabled = uiState !is UiState.Loading
                    ) {
                        Text(if (uiState is UiState.Loading) "Classifying…" else "Classify")
                    }
                }

                when (uiState) {
                    is UiState.Error -> Text(
                        text = (uiState as UiState.Error).message,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.fillMaxWidth()
                    )

                    is UiState.Success -> {
                        val s = uiState as UiState.Success
                        Text(
                            text = "Verdict: ${s.label} • ${s.raw}",
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    else -> {}
                }
            }
        }
    }
}

