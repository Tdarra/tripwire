package com.example.tripwire.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.example.tripwire.domain.Label
import androidx.compose.material3.ExperimentalMaterial3Api


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScamScanScreen(vm: ScamScanViewModel) {
    val state by vm.state.collectAsState()
    val input by vm.input.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("ScamScan") })
        }
    ) { pad ->
        Column(
            modifier = Modifier
                .padding(pad)
                .padding(16.dp)
                .fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { vm.input.value = it },
                label = { Text("Paste a message to check") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 5,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { vm.classify() })
            )
            Button(
                onClick = { vm.classify() },
                modifier = Modifier.align(Alignment.End),
                enabled = state !is UiState.Loading
            ) {
                Text("Classify")
            }

            when (state) {
                UiState.Idle -> {}
                UiState.Loading -> {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    Text("Classifying…")
                }
                is UiState.Error -> {
                    val msg = (state as UiState.Error).message
                    AssistChip(onClick = {}, label = { Text("Error") })
                    Text(msg, color = MaterialTheme.colorScheme.error)
                }
                is UiState.Success -> {
                    val s = state as UiState.Success
                    val color = when (s.label) {
                        Label.SCAM -> MaterialTheme.colorScheme.error
                        Label.SAFE -> MaterialTheme.colorScheme.primary
                        Label.UNCERTAIN -> MaterialTheme.colorScheme.tertiary
                    }
                    ElevatedCard {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "Verdict: ${s.label}",
                                style = MaterialTheme.typography.headlineSmall,
                                color = color
                            )
                            Text(
                                text = "Model output: ${s.raw}",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }
            }
        }
    }
}

@Preview
@Composable
private fun PreviewScamScan() {
    // Simple preview placeholder
    Text("ScamScan")
}
