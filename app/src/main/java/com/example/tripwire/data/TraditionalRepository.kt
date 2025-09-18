package com.example.tripwire.data

import com.example.tripwire.domain.Label
import com.example.tripwire.domain.Verdict
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory

/**
 * Repository that calls the server-side XGBoost endpoint (/classify-xgb).
 */
class TraditionalRepository(
    private val api: ProxyApi
) : ClassifierRepository {

    override suspend fun classify(message: String): Verdict = withContext(Dispatchers.IO) {
        try {
            val res = api.classifyXgb(ClassifyRequest(message))
            val label = when (res.label.uppercase()) {
                "SCAM" -> Label.SCAM
                "SAFE" -> Label.SAFE
                else -> Label.UNCERTAIN
            }
            Verdict(label, res.raw)
        } catch (e: Exception) {
            // You can add logging here if needed
            throw e
        }
    }

    companion object {
        fun create(baseUrl: String): TraditionalRepository {
            val httpLog = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            }
            val client = OkHttpClient.Builder()
                .addInterceptor(httpLog)
                .build()

            val moshi = Moshi.Builder()
                .addLast(KotlinJsonAdapterFactory())
                .build()

            val retrofit = Retrofit.Builder()
                .baseUrl(if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/")
                .client(client)
                .addConverterFactory(MoshiConverterFactory.create(moshi))
                .build()

            return TraditionalRepository(retrofit.create(ProxyApi::class.java))
        }
    }
}
