package com.example.tripwire.domain

class ClassifierPrompt {
    fun build(message: String): String {
        val sanitized = message.trim().replace("\n", " ")
        return """
You are a strict binary classifier for consumer scam detection.

Rules (examples of likely SCAM):
- Unsolicited money requests, gift cards, crypto, urgent payment or account lock warnings.
- Claims of prizes, refunds, tax rebates requiring action or links.
- Impersonation of banks, delivery, government, merchants; suspicious shortened links.
- Poor grammar + pressure tactics.

Output contract:
- Return exactly one word: SCAM or SAFE.
- No punctuation, no quotes, no explanations.

Classify the following message:
"$sanitized"
""".trim()
    }
}
