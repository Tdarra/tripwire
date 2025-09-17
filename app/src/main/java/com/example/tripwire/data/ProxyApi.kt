package com.example.tripwire.data

import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

@JsonClass(generateAdapter = true)
data class ClassifyRequest(val message: String)

@JsonClass(generateAdapter = true)
data class ClassifyResponse(val label: String, val raw: String)

interface ProxyApi {
    @POST("classify")
    suspend fun classify(
        @Body body: ClassifyRequest,
        @Header("X-Client-Token") clientToken: String = "demo"
    ): ClassifyResponse
}
