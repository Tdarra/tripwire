import java.util.Properties

// ---- load config from local.properties (with env / -P fallbacks) ----
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

fun prop(name: String, default: String = ""): String =
    (localProps.getProperty(name)
        ?: System.getenv(name)
        ?: (project.findProperty(name) as String?))
        ?.trim() ?: default

val geminiKey: String = prop("GEMINI_API_KEY")
val proxyBaseUrl: String = prop("PROXY_BASE_URL")
val loggingFlag: String = prop("LOGGING", "true") // "true" or "false"

if (geminiKey.isBlank()) {
    println("WARNING: GEMINI_API_KEY is blank. Set it in local.properties, env, or -P.")
}
if (proxyBaseUrl.isBlank()) {
    println("INFO: PROXY_BASE_URL is blank. App will fall back to on-device Gemini.")
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.example.tripwire"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.example.tripwire"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // ---- BuildConfig constants available in code ----
        buildConfigField("String", "GEMINI_API_KEY", "\"$geminiKey\"")
        buildConfigField("String", "PROXY_BASE_URL", "\"$proxyBaseUrl\"")
        buildConfigField("boolean", "LOGGING", loggingFlag)
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            // override logging for release
            buildConfigField("boolean", "LOGGING", "false")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
            // keep verbose logs for debug
            buildConfigField("boolean", "LOGGING", "true")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true   // <-- required to generate BuildConfig
    }

    kotlinOptions { jvmTarget = "17" }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf("META-INF/AL2.0", "META-INF/LGPL2.1")
    }
}

kotlin {
    jvmToolchain(17) // Kotlin 2.x preferred
}

dependencies {
    implementation("com.google.android.material:material:1.12.0")

    // Compose + lifecycle
    implementation(platform("androidx.compose:compose-bom:2024.09.02"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")

    // Google AI Client for Gemini (Android)
    implementation("com.google.ai.client.generativeai:generativeai:0.9.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Retrofit + Moshi
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")

    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.09.02"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    androidTestImplementation("androidx.test:core-ktx:1.6.1")
    androidTestImplementation("androidx.test.ext:junit-ktx:1.2.1")

    // MockWebServer for unit tests
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}
