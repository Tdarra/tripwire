package com.example.tripwire.data

import com.example.tripwire.domain.Label
import com.example.tripwire.domain.Verdict
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

class ProxyRepository(
    private val api: ProxyApi
) : ClassifierRepository {

    override suspend fun classify(message: String): Verdict = withContext(Dispatchers.IO) {
        val res = api.classify(ClassifyRequest(message))
        val label = when (res.label.uppercase()) {
            "SCAM" -> Label.SCAM
            "SAFE" -> Label.SAFE
            else -> Label.UNCERTAIN
        }
        Verdict(label, res.raw)
    }

    companion object {
        fun create(baseUrl: String): ProxyRepository {
            val httpLog = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            }
            val client = OkHttpClient.Builder()
                .addInterceptor(httpLog)
                .build()
            val retrofit = Retrofit.Builder()
                .baseUrl(if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/")
                .client(client)
                .addConverterFactory(MoshiConverterFactory.create())
                .build()
            return ProxyRepository(retrofit.create(ProxyApi::class.java))
        }
    }
}
