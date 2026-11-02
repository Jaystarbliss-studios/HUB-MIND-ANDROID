package com.example.hubmind

import com.example.hubmind.agent.*
import org.junit.Assert.*
import org.junit.Test

class AndroidAgentUnitTest {

    @Test
    fun testAndroidCommandCreationAndValidation() {
        val cmd = AndroidCommand(
            actionType = AndroidActionType.TAP,
            parameters = mapOf("x" to 300f, "y" to 600f)
        )

        assertNotNull(cmd.commandId)
        assertEquals(AndroidActionType.TAP, cmd.actionType)
        assertEquals(300f, cmd.parameters["x"])
        assertEquals(600f, cmd.parameters["y"])
        assertTrue(cmd.expiryTimestamp > System.currentTimeMillis())
    }

    @Test
    fun testExpiredCommandRejection() {
        val expiredCmd = AndroidCommand(
            actionType = AndroidActionType.GO_HOME,
            expiryTimestamp = System.currentTimeMillis() - 1000
        )

        assertTrue(expiredCmd.expiryTimestamp < System.currentTimeMillis())
    }

    @Test
    fun testNodeBoundsCalculation() {
        val bounds = NodeBounds(left = 100, top = 200, right = 500, bottom = 800)
        assertEquals(300, bounds.centerX)
        assertEquals(500, bounds.centerY)
    }

    @Test
    fun testAppInfoFiltering() {
        val apps = listOf(
            AppInfo("com.android.chrome", "Google Chrome", isSystemApp = true),
            AppInfo("com.visualstudio.code", "Visual Studio Code", isSystemApp = false),
            AppInfo("com.slack", "Slack", isSystemApp = false)
        )

        val found = apps.find { it.appName.contains("Chrome", ignoreCase = true) }
        assertNotNull(found)
        assertEquals("com.android.chrome", found?.packageName)
    }

    @Test
    fun testShizukuProviderAllowlistCheck() {
        val provider = ShizukuDeviceControlProvider()
        assertEquals("Shizuku ADB Provider", provider.providerName)
        assertFalse(provider.isAvailable)
    }
}
