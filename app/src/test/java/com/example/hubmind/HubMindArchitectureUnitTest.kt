package com.example.hubmind

import com.example.hubmind.data.model.*
import com.example.hubmind.data.repository.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class HubMindArchitectureUnitTest {

    @Test
    fun testAuthRepositoryAdminAssignment() = runBlocking {
        val authRepo = AuthRepositoryImpl()
        val result = authRepo.signIn("johnrufai242@gmail.com", "any-password")
        assertTrue(result.isSuccess)
        val user = result.getOrNull()
        assertNotNull(user)
        assertEquals("admin", user?.role)
        assertEquals("active", user?.status)
    }

    @Test
    fun testDeviceRegistryContainsWindowsWorkstation() = runBlocking {
        val authRepo = AuthRepositoryImpl()
        val convRepo = ConversationRepositoryImpl()
        val deviceControl = DeviceControlRepositoryImpl(emptyList())

        // Test device command execution
        val result = deviceControl.executeTool(
            targetDeviceId = "win-main-workstation",
            toolName = "launch_windows_application",
            args = mapOf("appName" to "code.exe")
        )
        assertTrue(result.success)
        assertTrue(result.verified)

        val history = deviceControl.commandHistory.value
        assertEquals(1, history.size)
        assertEquals("launch_windows_application", history[0].toolName)
        assertEquals(CommandStatus.COMPLETED, history[0].status)
    }

    @Test
    fun testConversationPostingAndJessReplying() = runBlocking {
        val convRepo = ConversationRepositoryImpl()
        val currentConv = convRepo.currentConversation.value
        assertNotNull(currentConv)

        val convId = currentConv!!.id
        val userMsg = convRepo.postUserMessage(convId, "Jess, check tasks")
        assertEquals(MessageSender.USER, userMsg.sender)

        val jessMsg = convRepo.appendJessResponse(convId, "Tasks are up to date", null, "done_verified")
        assertEquals(MessageSender.JESS, jessMsg.sender)
        assertEquals("done_verified", jessMsg.executionStatus)

        val messages = convRepo.getMessages(convId).first()
        assertTrue(messages.any { it.id == userMsg.id })
        assertTrue(messages.any { it.id == jessMsg.id })
    }

    @Test
    fun testJessLiveStateTransitions() = runBlocking {
        val convRepo = ConversationRepositoryImpl()
        val deviceControl = DeviceControlRepositoryImpl(emptyList())
        // Mock device registry
        val deviceRegistry = object : DeviceRegistryRepository {
            private val win = DeviceNode("win-01", "PC", DevicePlatform.WINDOWS, "1.0", DeviceStatus.ONLINE)
            override val devices = kotlinx.coroutines.flow.MutableStateFlow(listOf(win))
            override val currentTargetDevice = kotlinx.coroutines.flow.MutableStateFlow<DeviceNode?>(win)
            override suspend fun selectTargetDevice(deviceId: String) {}
            override suspend fun registerCurrentDevice(androidNode: DeviceNode) {}
            override suspend fun pingDevice(deviceId: String) = true
            override suspend fun refreshDevices() {}
        }

        val jessRepo = JessRepositoryImpl(convRepo, deviceControl, deviceRegistry)
        assertEquals(JessLiveState.IDLE, jessRepo.liveState.value)

        jessRepo.startVoiceSession()
        assertEquals(JessLiveState.LISTENING, jessRepo.liveState.value)
        assertEquals(LiveConnectionState.CONNECTED, jessRepo.connectionState.value)
        assertEquals("android", jessRepo.activeLeaseClient.value)

        jessRepo.endVoiceSession()
        assertEquals(JessLiveState.IDLE, jessRepo.liveState.value)
    }
}
