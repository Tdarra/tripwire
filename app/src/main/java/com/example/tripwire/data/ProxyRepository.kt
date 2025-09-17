package com.example.tripwire.data

import com.example.tripwire.BuildConfig
import android.util.Log
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

class ProxyRepository(
    private val api: ProxyApi
) : ClassifierRepository {

    override suspend fun classify(message: String): Verdict = withContext(Dispatchers.IO) {
        try {
            val res = api.classify(ClassifyRequest(message))
            val label = when (res.label.uppercase()) {
                "SCAM" -> Label.SCAM
                "SAFE" -> Label.SAFE
                else -> Label.UNCERTAIN
            }
            Verdict(label, res.raw)
        } catch (e: Exception) {
            if (BuildConfig.LOGGING) {
                android.util.Log.e("TripWireProxy", "Proxy classify failed", e)
            }
            throw e
        }
    }

    companion object {
        fun create(baseUrl: String): ProxyRepository {
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

            return ProxyRepository(retrofit.create(ProxyApi::class.java))
        }
    }
}
