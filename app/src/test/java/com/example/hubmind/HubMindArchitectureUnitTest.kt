package com.example.hubmind

import com.example.hubmind.data.model.*
import com.example.hubmind.data.repository.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class HubMindArchitectureUnitTest {

    private fun testWindowsRegistry(): DeviceRegistryRepository {
        val win = DeviceNode(
            "win-01",
            "Test Windows workstation",
            DevicePlatform.WINDOWS,
            "test",
            DeviceStatus.ONLINE
        )
        return object : DeviceRegistryRepository {
            override val devices = kotlinx.coroutines.flow.MutableStateFlow(listOf(win))
            override val currentTargetDevice = kotlinx.coroutines.flow.MutableStateFlow<DeviceNode?>(win)
            override suspend fun selectTargetDevice(deviceId: String) {}
            override suspend fun registerCurrentDevice(androidNode: DeviceNode) {}
            override suspend fun pingDevice(deviceId: String) = false
            override suspend fun refreshDevices() {}
        }
    }

    @Test
    fun testAuthRepositoryDoesNotAcceptCredentialsWithoutFirebase() = runBlocking {
        val authRepo = AuthRepositoryImpl()
        val result = authRepo.signIn("johnrufai242@gmail.com", "any-password")
        assertTrue(result.isFailure)
        assertNotNull(authRepo.configurationError)
        assertNull(authRepo.currentUser.value)
    }

    @Test
    fun testRemoteCommandFailsWithoutAuthenticatedTransport() = runBlocking {
        val registry = testWindowsRegistry()
        val deviceControl = DeviceControlRepositoryImpl(emptyList(), registry)

        val result = deviceControl.executeTool(
            targetDeviceId = "win-01",
            toolName = "launch_windows_application",
            args = mapOf("appName" to "code.exe")
        )

        assertFalse(result.success)
        assertFalse(result.verified)
        assertTrue(result.error?.contains("No authenticated control transport") == true)

        val history = deviceControl.commandHistory.value
        assertEquals(1, history.size)
        assertEquals("launch_windows_application", history[0].toolName)
        assertEquals(CommandStatus.FAILED, history[0].status)
        assertEquals(1, deviceControl.activityRecords.value.size)
    }

    @Test
    fun testConversationStartsEmptyAndCanBeCreated() = runBlocking {
        val convRepo = ConversationRepositoryImpl()
        assertNull(convRepo.currentConversation.value)
        assertTrue(convRepo.conversations.value.isEmpty())

        val currentConv = convRepo.createConversation("Test conversation")
        val convId = currentConv.id
        val userMsg = convRepo.postUserMessage(convId, "Jess, check tasks")
        assertEquals(MessageSender.USER, userMsg.sender)

        val jessMsg = convRepo.appendJessResponse(convId, "I cannot access the task service yet.", null, null)
        assertEquals(MessageSender.JESS, jessMsg.sender)
        assertNull(jessMsg.executionStatus)

        val messages = convRepo.getMessages(convId).first()
        assertTrue(messages.any { it.id == userMsg.id })
        assertTrue(messages.any { it.id == jessMsg.id })
    }

    @Test
    fun testVoiceSessionIsNotReportedAsConnectedWithoutLiveTransport() = runBlocking {
        val convRepo = ConversationRepositoryImpl()
        val registry = testWindowsRegistry()
        val deviceControl = DeviceControlRepositoryImpl(emptyList(), registry)
        val jessRepo = JessRepositoryImpl(
            conversationRepository = convRepo,
            authRepository = AuthRepositoryImpl(),
            deviceControlRepository = deviceControl,
            deviceRegistryRepository = registry
        )

        assertEquals(JessLiveState.IDLE, jessRepo.liveState.value)
        assertFalse(jessRepo.startVoiceSession())
        assertEquals(JessLiveState.ERROR, jessRepo.liveState.value)
        assertEquals(LiveConnectionState.ERROR, jessRepo.connectionState.value)
        assertNull(jessRepo.activeLeaseClient.value)

        jessRepo.endVoiceSession()
        assertEquals(JessLiveState.IDLE, jessRepo.liveState.value)
        assertEquals(LiveConnectionState.DISCONNECTED, jessRepo.connectionState.value)
    }
}
