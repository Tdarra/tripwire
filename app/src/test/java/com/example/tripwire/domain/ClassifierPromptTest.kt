package com.example.tripwire.domain

import org.junit.Assert.assertTrue
import org.junit.Test

class ClassifierPromptTest {
    @Test
    fun promptContainsContractAndMessage() {
        val p = ClassifierPrompt().build("win $$$ now!")
        assertTrue(p.contains("Return exactly one word: SCAM or SAFE"))
        assertTrue(p.contains("win $$$ now!"))
    }
}
