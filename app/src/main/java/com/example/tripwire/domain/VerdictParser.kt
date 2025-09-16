package com.example.tripwire.domain

class VerdictParser {
    fun parse(modelText: String): Verdict {
        val token = modelText.trim().uppercase()
        val label = when {
            token.startsWith("SCAM") -> Label.SCAM
            token.startsWith("SAFE") -> Label.SAFE
            else -> Label.UNCERTAIN
        }
        return Verdict(label, modelText)
    }
}
