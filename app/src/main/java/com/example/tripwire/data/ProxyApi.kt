package com.example.tripwire.data

import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

data class ClassifyRequest(val message: String)
data class ClassifyResponse(val label: String, val raw: String)

interface ProxyApi {
    @POST("classify")
    suspend fun classify(
        @Body body: ClassifyRequest,
        @Header("X-Client-Token") clientToken: String = "demo"
    ): ClassifyResponse
}
