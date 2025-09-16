package com.example.tripwire.domain

enum class Label { SCAM, SAFE, UNCERTAIN }

data class Verdict(
    val label: Label,
    val raw: String
)
