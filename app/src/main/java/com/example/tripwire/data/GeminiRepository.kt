// app/src/main/java/com/example/tripwire/data/GeminiRepository.kt
package com.example.tripwire.data

import com.example.tripwire.domain.ClassifierPrompt
import com.example.tripwire.domain.Verdict
import com.example.tripwire.domain.VerdictParser
import com.google.ai.client.generativeai.GenerativeModel
import com.google.ai.client.generativeai.type.GenerateContentResponse
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

        // Use the String overload (no per-call config here)
        val response = model.generateContent(userPrompt)

        val text = response.safeText()
        parser.parse(text)
    }
}

/** Robustly extract plain text from the response without relying on extension props. */
private fun GenerateContentResponse.safeText(): String {
    val parts = candidates.firstOrNull()?.content?.parts ?: return ""
    return parts.filterIsInstance<TextPart>()
        .joinToString(separator = "") { it.text }
        .trim()
}
