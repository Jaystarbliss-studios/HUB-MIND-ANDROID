plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Firebase's Google Services plugin generates Android resources from the
// app-specific google-services.json. Keep local/CI builds possible without
// committing the owner's private Firebase app configuration.
if (file("google-services.json").isFile) {
    apply(plugin = "com.google.gms.google-services")
}

val releaseStoreFile = providers.gradleProperty("HUBMIND_RELEASE_STORE_FILE")
    .orElse(providers.environmentVariable("HUBMIND_RELEASE_STORE_FILE"))
    .orNull
val releaseStorePassword = providers.gradleProperty("HUBMIND_RELEASE_STORE_PASSWORD")
    .orElse(providers.environmentVariable("HUBMIND_RELEASE_STORE_PASSWORD"))
    .orNull
val releaseKeyAlias = providers.gradleProperty("HUBMIND_RELEASE_KEY_ALIAS")
    .orElse(providers.environmentVariable("HUBMIND_RELEASE_KEY_ALIAS"))
    .orNull
val releaseKeyPassword = providers.gradleProperty("HUBMIND_RELEASE_KEY_PASSWORD")
    .orElse(providers.environmentVariable("HUBMIND_RELEASE_KEY_PASSWORD"))
    .orNull
val releaseSigningConfigured = listOf(
    releaseStoreFile, releaseStorePassword, releaseKeyAlias, releaseKeyPassword
).all { !it.isNullOrBlank() }
val hubMindApiBaseUrl = providers.gradleProperty("HUBMIND_API_BASE_URL")
    .orElse(providers.environmentVariable("HUBMIND_API_BASE_URL"))
    .orElse("https://hub-mind.netlify.app")
    .get()

android {
    namespace = "com.example"
    compileSdk = 35

    defaultConfig {
        // Set before the first private release. Register this exact package
        // name as an Android app in the existing Hub-Mind Firebase project.
        applicationId = "com.jaystarbliss.hubmind"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "HUBMIND_API_BASE_URL", "\"" + hubMindApiBaseUrl + "\"")
    }

    signingConfigs {
        if (releaseSigningConfigured) {
            create("release") {
                storeFile = file(requireNotNull(releaseStoreFile))
                storePassword = requireNotNull(releaseStorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Never ship a release signed with Android's public debug key.
            // Without owner-supplied signing credentials Gradle emits an
            // unsigned release APK, which cannot be distributed as an update.
            signingConfig = if (releaseSigningConfigured) {
                signingConfigs.getByName("release")
            } else {
                null
            }
        }
        debug {
            // Use AGP's standard per-developer debug signing configuration.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)

    // Use the same Firebase project as the Hub-Mind website. The APK must
    // contain this app's own google-services.json downloaded from Firebase.
    implementation(platform("com.google.firebase:firebase-bom:35.1.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}
