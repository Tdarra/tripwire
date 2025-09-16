package com.example.tripwire.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class VerdictParserTest {
    @Test fun parseScam() {
        val v = VerdictParser().parse("SCAM")
        assertEquals(Label.SCAM, v.label)
    }
    @Test fun parseSafeLowercase() {
        val v = VerdictParser().parse("safe")
        assertEquals(Label.SAFE, v.label)
    }
    @Test fun parseUncertain() {
        val v = VerdictParser().parse("maybe")
        assertEquals(Label.UNCERTAIN, v.label)
    }
}
