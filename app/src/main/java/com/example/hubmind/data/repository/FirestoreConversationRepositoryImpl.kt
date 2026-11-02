package com.example.hubmind.data.repository

import android.content.Context
import com.example.hubmind.data.HubMindRuntime
import com.example.hubmind.data.model.ChatMessage
import com.example.hubmind.data.model.Conversation
import com.example.hubmind.data.model.MessageSender
import com.google.firebase.FirebaseApp
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Uses the same users/{uid}/conversations/{id} documents and embedded message
 * array as the Hub-Mind web/desktop clients.
 */
class FirestoreConversationRepositoryImpl(
    context: Context,
    private val authRepository: AuthRepository
) : ConversationRepository {
    private val app = FirebaseApp.getInstance()
    private val databaseId = HubMindRuntime.config?.firestoreDatabaseId ?: "(default)"
    private val firestore = if (databaseId == "(default)") {
        FirebaseFirestore.getInstance(app)
    } else {
        FirebaseFirestore.getInstance(app, databaseId)
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _conversations = MutableStateFlow<List<Conversation>>(emptyList())
    override val conversations: StateFlow<List<Conversation>> = _conversations.asStateFlow()

    private val _currentConversation = MutableStateFlow<Conversation?>(null)
    override val currentConversation: StateFlow<Conversation?> = _currentConversation.asStateFlow()

    private val messagesMap = ConcurrentHashMap<String, MutableStateFlow<List<ChatMessage>>>()
    private val ready = MutableStateFlow(false)
    private var listener: ListenerRegistration? = null
    @Volatile private var activeUserId: String? = null

    init {
        scope.launch {
            authRepository.currentUser.collectLatest { user ->
                listener?.remove()
                listener = null
                activeUserId = user?.id
                ready.value = false
                if (user == null) {
                    _conversations.value = emptyList()
                    _currentConversation.value = null
                    messagesMap.clear()
                    ready.value = true
                } else {
                    listener = firestore.collection("users")
                        .document(user.id)
                        .collection("conversations")
                        .addSnapshotListener { snapshot, error ->
                            if (error != null) {
                                ready.value = true
                                return@addSnapshotListener
                            }
                            val decoded = snapshot?.documents.orEmpty()
                                .mapNotNull { document -> decodeConversation(document.id, document.data.orEmpty()) }
                                .sortedByDescending { it.updatedAt }
                            _conversations.value = decoded
                            decoded.forEach { conversation ->
                                messagesMap.getOrPut(conversation.id) { MutableStateFlow(emptyList()) }
                                    .value = decodeMessages(
                                        snapshot?.documents?.firstOrNull { it.id == conversation.id }?.data?.get("messages")
                                    )
                            }
                            val selectedId = _currentConversation.value?.id
                            _currentConversation.value = decoded.firstOrNull { it.id == selectedId }
                                ?: decoded.firstOrNull()
                            ready.value = true
                        }
                }
            }
        }
    }

    override suspend fun awaitReady() {
        ready.first { it }
    }

    override fun getMessages(conversationId: String): Flow<List<ChatMessage>> {
        return messagesMap.getOrPut(conversationId) { MutableStateFlow(emptyList()) }.asStateFlow()
    }

    override suspend fun selectConversation(conversationId: String) {
        _currentConversation.value = _conversations.value.firstOrNull { it.id == conversationId }
    }

    override suspend fun createConversation(title: String): Conversation {
        val userId = activeUserId ?: authRepository.currentUser.value?.id
            ?: throw IllegalStateException("Sign in to Hub-Mind before creating a conversation.")
        val now = Instant.now().toString()
        val id = "conv-" + UUID.randomUUID().toString()
        val conversation = Conversation(
            id = id,
            title = title.ifBlank { "New Jess Conversation" },
            summary = "",
            messageCount = 0,
            createdAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis()
        )
        messagesMap[id] = MutableStateFlow(emptyList())
        _conversations.value = listOf(conversation) + _conversations.value
        _currentConversation.value = conversation

        val document = mapOf(
            "id" to id,
            "userId" to userId,
            "title" to conversation.title,
            "summary" to "",
            "messageCount" to 0,
            "messages" to emptyList<Map<String, Any>>(),
            "rootMessageId" to null,
            "activeLeafId" to null,
            "createdAt" to now,
            "updatedAt" to now,
            "isLiveSession" to false
        )
        runCatching {
            firestore.collection("users").document(userId)
                .collection("conversations").document(id).set(document).await()
        }.onFailure {
            android.util.Log.w("HubMindConversations", "Conversation is local until Firestore is reachable: ${it.message}")
        }
        return conversation
    }

    override suspend fun postUserMessage(
        conversationId: String,
        text: String,
        targetDeviceId: String?
    ): ChatMessage {
        val message = ChatMessage(
            id = "msg-" + UUID.randomUUID().toString(),
            sender = MessageSender.USER,
            text = text,
            timestamp = System.currentTimeMillis(),
            targetDeviceId = targetDeviceId
        )
        appendLocalMessage(conversationId, message)
        persistMessage(conversationId, message)
        return message
    }

    override suspend fun appendJessResponse(
        conversationId: String,
        text: String,
        toolName: String?,
        status: String?
    ): ChatMessage {
        val message = ChatMessage(
            id = "msg-" + UUID.randomUUID().toString(),
            sender = MessageSender.JESS,
            text = text,
            timestamp = System.currentTimeMillis(),
            toolCallName = toolName,
            executionStatus = status
        )
        appendLocalMessage(conversationId, message)
        persistMessage(conversationId, message)
        return message
    }

    private fun appendLocalMessage(conversationId: String, message: ChatMessage) {
        val flow = messagesMap.getOrPut(conversationId) { MutableStateFlow(emptyList()) }
        flow.value = flow.value + message
        val updatedAt = message.timestamp
        _conversations.value = _conversations.value.map {
            if (it.id == conversationId) it.copy(
                messageCount = it.messageCount + 1,
                updatedAt = updatedAt
            ) else it
        }.sortedByDescending { it.updatedAt }
        _currentConversation.value = _conversations.value.firstOrNull { it.id == conversationId }
            ?: _currentConversation.value
    }

    private suspend fun persistMessage(conversationId: String, message: ChatMessage) {
        val userId = activeUserId ?: authRepository.currentUser.value?.id ?: return
        val payload = mapOf(
            "id" to message.id,
            "sender" to if (message.sender == MessageSender.USER) "user" else "jess",
            "text" to message.text,
            "timestamp" to Instant.ofEpochMilli(message.timestamp).toString(),
            "isStreaming" to false
        )
        val ref = firestore.collection("users").document(userId)
            .collection("conversations").document(conversationId)
        runCatching {
            ref.update(
                "messages", FieldValue.arrayUnion(payload),
                "messageCount", FieldValue.increment(1),
                "updatedAt", Instant.now().toString()
            ).await()
        }.onFailure {
            android.util.Log.w("HubMindConversations", "Could not sync conversation message: ${it.message}")
        }
    }

    private fun decodeConversation(id: String, data: Map<String, Any>): Conversation? {
        val title = data["title"] as? String ?: return null
        return Conversation(
            id = id,
            title = title,
            summary = data["summary"] as? String ?: "",
            messageCount = (data["messageCount"] as? Number)?.toInt() ?: 0,
            createdAt = parseTimestamp(data["createdAt"]),
            updatedAt = parseTimestamp(data["updatedAt"]),
            isLiveSession = data["isLiveSession"] as? Boolean ?: false
        )
    }

    private fun decodeMessages(raw: Any?): List<ChatMessage> {
        val entries = raw as? List<*> ?: return emptyList()
        return entries.mapNotNull { entry ->
            val data = entry as? Map<*, *> ?: return@mapNotNull null
            val id = data["id"] as? String ?: return@mapNotNull null
            val sender = when ((data["sender"] as? String)?.lowercase()) {
                "user" -> MessageSender.USER
                "jess", "assistant", "model" -> MessageSender.JESS
                else -> return@mapNotNull null
            }
            ChatMessage(
                id = id,
                sender = sender,
                text = data["text"] as? String ?: "",
                timestamp = parseTimestamp(data["timestamp"]),
                isStreaming = data["isStreaming"] as? Boolean ?: false
            )
        }
    }

    private fun parseTimestamp(value: Any?): Long = when (value) {
        is Number -> value.toLong()
        is Timestamp -> value.toDate().time
        is String -> runCatching { Instant.parse(value).toEpochMilli() }.getOrDefault(0L)
        else -> 0L
    }
}
