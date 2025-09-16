package com.example.tripwire.ui

import com.example.tripwire.data.ClassifierRepository
import com.example.tripwire.domain.Label
import com.example.tripwire.domain.Verdict
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeRepo(private val result: Result<Verdict>) : ClassifierRepository {
    override suspend fun classify(message: String): Verdict = result.getOrThrow()
}

@OptIn(ExperimentalCoroutinesApi::class)
class ScamScanViewModelTest {
    @Test
    fun successFlow() = runTest {
        val vm = ScamScanViewModel(FakeRepo(Result.success(Verdict(Label.SCAM, "SCAM"))))
        vm.input.value = "Pay now or account locked!"
        vm.classify()
        // Let coroutine run
        val s = vm.state.first { it is UiState.Success }
        assertTrue(s is UiState.Success && (s as UiState.Success).label == Label.SCAM)
    }

    @Test
    fun errorFlow() = runTest {
        val vm = ScamScanViewModel(FakeRepo(Result.failure(RuntimeException("boom"))))
        vm.input.value = "hello"
        vm.classify()
        val s = vm.state.first { it is UiState.Error }
        assertTrue(s is UiState.Error)
    }
}
