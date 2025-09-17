package com.example.tripwire.data

import com.example.tripwire.domain.Label
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class ProxyRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var repo: ProxyRepository

    @Before fun setUp() {
        server = MockWebServer().apply { start() }
        val base = server.url("/api/").toString()
        repo = ProxyRepository.create(base)
    }

    @After fun tearDown() {
        server.shutdown()
    }

    @Test fun classify_scam() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(200)
            .setBody("""{"label":"SCAM","raw":"SCAM"}"""))
        val verdict = repo.classify("you won a prize click link")
        assertEquals(Label.SCAM, verdict.label)
    }

    @Test fun classify_safe() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(200)
            .setBody("""{"label":"SAFE","raw":"SAFE"}"""))
        val verdict = repo.classify("let's grab lunch")
        assertEquals(Label.SAFE, verdict.label)
    }
}
