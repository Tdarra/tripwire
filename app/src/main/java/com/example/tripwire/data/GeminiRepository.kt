// app/src/main/java/com/example/tripwire/data/GeminiRepository.kt
package com.example.tripwire.data

import android.util.Log
import com.example.tripwire.BuildConfig
import com.example.tripwire.domain.ClassifierPrompt
import com.example.tripwire.domain.Verdict
import com.example.tripwire.domain.VerdictParser
import com.google.ai.client.generativeai.GenerativeModel
import com.google.ai.client.generativeai.type.GenerateContentResponse
import com.google.ai.client.generativeai.type.Part
import com.google.ai.client.generativeai.type.TextPart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

interface ClassifierRepository {
    suspend fun classify(message: String): Verdict
}

class GeminiRepository(
    private val model: GenerativeModel,
    private val prompt: ClassifierPrompt = ClassifierPrompt(),
    private val parser: VerdictParser = VerdictParser()
) : ClassifierRepository {

    override suspend fun classify(message: String): Verdict = withContext(Dispatchers.IO) {
        val userPrompt = prompt.build(message)

        if (BuildConfig.LOGGING) {
            Log.d(TAG, "classify() inputMessage=\"${message}\"")
            Log.d(TAG, "classify() prompt(len=${userPrompt.length})=\n${userPrompt}")
        }

        val response = try {
            model.generateContent(userPrompt)
        } catch (e: Exception) {
            if (BuildConfig.LOGGING) Log.e(TAG, "Gemini call failed", e)
            throw e
        }

        if (BuildConfig.LOGGING) {
            Log.d(TAG, "response candidates=${response.candidates.size}")
            Log.d(TAG, "response.dump:\n${response.dump()}")
        }

        val text = response.safeText()
        if (BuildConfig.LOGGING) {
            Log.d(TAG, "response.safeText=\"${text}\"")
        }

        parser.parse(text)
    }

    companion object {
        private const val TAG = "TripWireGemini"
    }
}

/** Extract plain text from the top candidate. */
private fun GenerateContentResponse.safeText(): String {
    val parts = candidates.firstOrNull()?.content?.parts ?: emptyList()
    return parts.filterIsInstance<TextPart>()
        .joinToString(separator = "") { it.text }
        .trim()
}

/** Human-readable dump of the response for Logcat. */
private fun GenerateContentResponse.dump(): String {
    val sb = StringBuilder()
    sb.appendLine("promptFeedback=${promptFeedback?.toString() ?: "null"}")
    candidates.forEachIndexed { idx, c ->
        sb.appendLine("candidate[$idx].finishReason=${c.finishReason}")
        sb.appendLine("candidate[$idx].safetyRatings=${c.safetyRatings}")
        val parts: List<Part> = c.content.parts
        val textJoined = parts.filterIsInstance<TextPart>().joinToString("") { it.text }
        sb.appendLine("candidate[$idx].text=\"${textJoined}\"")
    }
    return sb.toString()
}
