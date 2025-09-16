package com.example.tripwire.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.tripwire.BuildConfig
import com.example.tripwire.data.ClassifierRepository
import com.example.tripwire.data.GeminiRepository
import com.example.tripwire.domain.Label
import com.google.ai.client.generativeai.GenerativeModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import com.google.ai.client.generativeai.type.generationConfig


sealed interface UiState {
    data object Idle : UiState
    data object Loading : UiState
    data class Success(val label: Label, val raw: String) : UiState
    data class Error(val message: String) : UiState
}

class ScamScanViewModel(
    private val repo: ClassifierRepository
) : ViewModel() {

    private val _state = MutableStateFlow<UiState>(UiState.Idle)
    val state: StateFlow<UiState> = _state

    val input = MutableStateFlow("")

    fun classify() {
        val text = input.value.trim()
        if (text.isEmpty()) {
            _state.value = UiState.Error("Please paste a message first.")
            return
        }
        _state.value = UiState.Loading
        viewModelScope.launch {
            try {
                val verdict = repo.classify(text)
                _state.value = UiState.Success(verdict.label, verdict.raw)
            } catch (e: Exception) {
                _state.value = UiState.Error("Couldn’t classify. Check your network/API key.")
            }
        }
    }

    companion object {
        fun factory(): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val apiKey = BuildConfig.GEMINI_API_KEY
                val model = GenerativeModel(
                    modelName = "gemini-1.5-flash",
                    apiKey = apiKey,
                    generationConfig = generationConfig {
                        temperature = 0f   // <-- Float, not Double
                        topK = 1
                        topP = 0f          // <-- Float
                        maxOutputTokens = 16
                    }
                )
                val repo = GeminiRepository(model)
                return ScamScanViewModel(repo) as T
            }
        }
    }
}
