package com.example.tripwire.ui

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.tripwire.BuildConfig
import com.example.tripwire.data.ClassifierRepository
import com.example.tripwire.data.GeminiRepository
import com.example.tripwire.data.ProxyRepository
import com.example.tripwire.data.TraditionalRepository // <-- make sure this exists
import com.example.tripwire.domain.Label
import com.google.ai.client.generativeai.GenerativeModel
import com.google.ai.client.generativeai.type.generationConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed interface UiState {
    data object Idle : UiState
    data object Loading : UiState
    data class Success(val label: Label, val raw: String) : UiState
    data class Error(val message: String) : UiState
}

class ScamScanViewModel(
    private val genaiRepo: ClassifierRepository,           // /api/classify (Gemini)
    private val xgbRepo: ClassifierRepository? = null      // /api/classify-xgb (XGBoost), nullable for fallback
) : ViewModel() {

    private val _state = MutableStateFlow<UiState>(UiState.Idle)
    val state: StateFlow<UiState> = _state

    val input = MutableStateFlow("")
    // ✅ new: checkbox state (default checked = GenAI)
    val useGenAI = MutableStateFlow(true)
    fun setUseGenAI(checked: Boolean) { useGenAI.value = checked }

    fun classify() {
        val text = input.value.trim()
        if (text.isEmpty()) {
            _state.value = UiState.Error("Please paste a message first.")
            return
        }
        _state.value = UiState.Loading
        viewModelScope.launch {
            try {
                // pick repo based on the checkbox, but fall back to genai if xgb not available
                val repo = if (useGenAI.value || xgbRepo == null) genaiRepo else xgbRepo
                val verdict = repo.classify(text)
                _state.value = UiState.Success(verdict.label, verdict.raw)
            } catch (e: Exception) {
                _state.value = UiState.Error("Couldn’t classify. Check your network/API key.")
            }
        }
    }

    companion object {
        private const val TAG = "TripWireVM"

        fun factory(): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val proxyBase = BuildConfig.PROXY_BASE_URL

                if (proxyBase.isNotBlank()) {
                    if (BuildConfig.LOGGING) Log.d(TAG, "Using proxy: $proxyBase")

                    // GENAI via /api/classify
                    val genai = ProxyRepository.create(proxyBase)

                    // TRADITIONAL via /api/classify-xgb
                    val xgb = TraditionalRepository.create(proxyBase) // provide a similar create() as ProxyRepository

                    return ScamScanViewModel(genai, xgb) as T
                }

                // Fallback: on-device Gemini (needs key); no XGB path available
                val apiKey = BuildConfig.GEMINI_API_KEY
                if (BuildConfig.LOGGING) {
                    Log.d(TAG, if (apiKey.isNotBlank())
                        "GEMINI_API_KEY present (len=${apiKey.length}, tail=${apiKey.takeLast(4)})"
                    else "GEMINI_API_KEY is MISSING/BLANK")
                }

                val model = GenerativeModel(
                    modelName = "gemini-1.5-flash",
                    apiKey = apiKey,
                    generationConfig = generationConfig {
                        temperature = 0f; topK = 1; topP = 0f; maxOutputTokens = 16
                    }
                )
                val genai = GeminiRepository(model)
                return ScamScanViewModel(genai, null) as T
            }
        }
    }
}
