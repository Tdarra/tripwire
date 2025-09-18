package com.example.tripwire.data

import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

// Request/Response models
@JsonClass(generateAdapter = true)
data class ClassifyRequest(val message: String)

@JsonClass(generateAdapter = true)
data class ClassifyResponse(
    val label: String,
    val raw: String
)

/**
 * Retrofit interface for proxy API endpoints.
 * - /classify     → Gemini (GenAI backend)
 * - /classify-xgb → XGBoost (traditional ML backend)
 */
interface ProxyApi {

    @POST("classify")
    suspend fun classify(
        @Body body: ClassifyRequest,
        @Header("X-Client-Token") clientToken: String = "demo"
    ): ClassifyResponse

    @POST("classify-xgb")
    suspend fun classifyXgb(
        @Body body: ClassifyRequest,
        @Header("X-Client-Token") clientToken: String = "demo"
    ): ClassifyResponse
}
