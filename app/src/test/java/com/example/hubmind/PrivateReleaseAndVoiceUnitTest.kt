package com.example.hubmind

import com.example.hubmind.data.model.JessLiveState
import com.example.hubmind.data.updater.AppUpdateManifest
import org.junit.Assert.*
import org.junit.Test

class PrivateReleaseAndVoiceUnitTest {

    @Test
    fun testAppUpdateManifestComparison() {
        val currentCode = 1
        val manifest = AppUpdateManifest(
            versionCode = 2,
            versionName = "2.5.0",
            apkUrl = "https://hub-mind.netlify.app/downloads/hubmind-release.apk",
            releaseNotes = "Private Android update test.",
            sha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        )

        assertTrue(manifest.versionCode > currentCode)
        assertEquals("2.5.0", manifest.versionName)
        assertEquals("https://hub-mind.netlify.app/downloads/hubmind-release.apk", manifest.apkUrl)
    }

    @Test
    fun testJessLiveStateEnumValues() {
        val states = JessLiveState.entries
        assertTrue(states.contains(JessLiveState.IDLE))
        assertTrue(states.contains(JessLiveState.LISTENING))
        assertTrue(states.contains(JessLiveState.THINKING))
        assertTrue(states.contains(JessLiveState.SPEAKING))
        assertTrue(states.contains(JessLiveState.MUTED))
        assertTrue(states.contains(JessLiveState.ERROR))
    }
}
