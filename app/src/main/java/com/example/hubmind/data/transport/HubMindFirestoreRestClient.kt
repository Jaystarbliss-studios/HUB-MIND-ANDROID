package com.example.hubmind.data.transport

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

private data class HubMindFirebaseConfig(
    val projectId: String,
    val databaseId: String
)

data class HubMindFirestoreDocument(
    val id: String,
    val fields: Map<String, Any?>,
    val updateTime: String?
)

/**
 * Small authenticated Firestore REST client for the Android command receiver.
 * Requests use the signed-in user's short-lived Firebase ID token and therefore
 * remain subject to the same Firestore security rules as the web workspace.
 */
class HubMindFirestoreRestClient {
    companion object {
        private const val TAG = "HubMindFirestore"
        private const val CONFIG_URL = "https://hub-mind.netlify.app/api/config"
        private const val FALLBACK_PROJECT_ID = "gen-lang-client-0197530608"
        private const val FALLBACK_DATABASE_ID = "ai-studio-hubmind-4cac2024-c6eb-4208-80cf-928714dfd430"
    }

    @Volatile
    private var cachedConfig: HubMindFirebaseConfig? = null
    @Volatile
    private var configLoadedAt: Long = 0

    private fun encodePathSegment(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")

    private fun loadConfig(): HubMindFirebaseConfig {
        val existing = cachedConfig
        if (existing != null && System.currentTimeMillis() - configLoadedAt < 60 * 60 * 1000L) {
            return existing
        }

        val response = request(CONFIG_URL, "GET", null, null)
        val firebase = response.optJSONObject("firebase")
        val config = HubMindFirebaseConfig(
            projectId = firebase?.optString("projectId").orEmpty().ifBlank { FALLBACK_PROJECT_ID },
            databaseId = firebase?.optString("firestoreDatabaseId").orEmpty()
                .ifBlank { FALLBACK_DATABASE_ID }
        )
        cachedConfig = config
        configLoadedAt = System.currentTimeMillis()
        return config
    }

    private fun documentsBase(): String {
        val config = loadConfig()
        return "https://firestore.googleapis.com/v1/projects/${encodePathSegment(config.projectId)}/databases/${encodePathSegment(config.databaseId)}/documents"
    }

    private fun request(
        url: String,
        method: String,
        bearerToken: String?,
        body: JSONObject?
    ): JSONObject {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 7000
            readTimeout = 10000
            setRequestProperty("Accept", "application/json")
            if (!bearerToken.isNullOrBlank()) {
                setRequestProperty("Authorization", "Bearer $bearerToken")
            }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }

        try {
            if (body != null) {
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                val detail = runCatching { JSONObject(raw).optJSONObject("error")?.optString("message") }.getOrNull()
                throw IllegalStateException(detail?.takeIf { it.isNotBlank() } ?: "Hub-Mind API request failed (HTTP $status).")
            }
            return if (raw.isBlank()) JSONObject() else JSONObject(raw)
        } finally {
            connection.disconnect()
        }
    }

    private fun firestoreValue(value: Any?): JSONObject {
        return when (value) {
            null -> JSONObject().put("nullValue", JSONObject.NULL)
            is Boolean -> JSONObject().put("booleanValue", value)
            is Byte, is Short, is Int, is Long -> JSONObject().put("integerValue", value.toString())
            is Float, is Double -> JSONObject().put("doubleValue", (value as Number).toDouble())
            is Map<*, *> -> {
                val fields = JSONObject()
                value.forEach { (key, item) ->
                    if (key is String) fields.put(key, firestoreValue(item))
                }
                JSONObject().put("mapValue", JSONObject().put("fields", fields))
            }
            is List<*> -> {
                val values = JSONArray()
                value.forEach { values.put(firestoreValue(it)) }
                JSONObject().put("arrayValue", JSONObject().put("values", values))
            }
            else -> JSONObject().put("stringValue", value.toString())
        }
    }

    private fun firestoreFields(values: Map<String, Any?>): JSONObject {
        val fields = JSONObject()
        values.forEach { (key, value) -> fields.put(key, firestoreValue(value)) }
        return fields
    }

    private fun decodeValue(value: JSONObject): Any? {
        return when {
            value.has("stringValue") -> value.optString("stringValue")
            value.has("booleanValue") -> value.optBoolean("booleanValue")
            value.has("integerValue") -> value.optString("integerValue").toLongOrNull() ?: 0L
            value.has("doubleValue") -> value.optDouble("doubleValue")
            value.has("nullValue") -> null
            value.has("mapValue") -> decodeFields(value.optJSONObject("mapValue")?.optJSONObject("fields") ?: JSONObject())
            value.has("arrayValue") -> {
                val source = value.optJSONObject("arrayValue")?.optJSONArray("values") ?: JSONArray()
                (0 until source.length()).mapNotNull { index ->
                    source.optJSONObject(index)?.let { decodeValue(it) }
                }
            }
            else -> null
        }
    }

    private fun decodeFields(fields: JSONObject): Map<String, Any?> {
        val result = mutableMapOf<String, Any?>()
        val keys = fields.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            fields.optJSONObject(key)?.let { result[key] = decodeValue(it) }
        }
        return result
    }

    private fun documentPath(userId: String, collectionName: String, documentId: String): String =
        "${documentsBase()}/users/${encodePathSegment(userId)}/${collectionName}/${encodePathSegment(documentId)}"

    fun upsertAndroidDevice(
        userId: String,
        deviceId: String,
        deviceName: String,
        capabilities: List<String>,
        lastSeenAt: Long,
        bearerToken: String
    ) {
        val fields = mapOf(
            "deviceId" to deviceId,
            "deviceName" to deviceName,
            "platform" to "ANDROID",
            "status" to "ONLINE",
            "capabilities" to capabilities,
            "lastSeenAt" to lastSeenAt,
            "updatedAt" to lastSeenAt
        )
        val body = JSONObject().put("fields", firestoreFields(fields))
        val url = documentPath(userId, "devices", deviceId) +
            "?updateMask.fieldPaths=status&updateMask.fieldPaths=deviceId&updateMask.fieldPaths=deviceName" +
            "&updateMask.fieldPaths=platform&updateMask.fieldPaths=capabilities" +
            "&updateMask.fieldPaths=lastSeenAt&updateMask.fieldPaths=updatedAt"
        request(url, "PATCH", bearerToken, body)
    }

    fun markAndroidDeviceOffline(userId: String, deviceId: String, bearerToken: String) {
        val now = System.currentTimeMillis()
        val body = JSONObject().put(
            "fields",
            firestoreFields(mapOf("status" to "OFFLINE", "lastSeenAt" to now, "updatedAt" to now))
        )
        val url = documentPath(userId, "devices", deviceId) +
            "?updateMask.fieldPaths=status&updateMask.fieldPaths=lastSeenAt&updateMask.fieldPaths=updatedAt"
        request(url, "PATCH", bearerToken, body)
    }

    fun listDeviceCommands(userId: String, bearerToken: String): List<HubMindFirestoreDocument> {
        val response = request(
            "${documentsBase()}/users/${encodePathSegment(userId)}/deviceCommands?pageSize=100",
            "GET",
            bearerToken,
            null
        )
        val docs = response.optJSONArray("documents") ?: JSONArray()
        return (0 until docs.length()).mapNotNull { index ->
            val doc = docs.optJSONObject(index) ?: return@mapNotNull null
            val name = doc.optString("name")
            val id = name.substringAfterLast('/')
            if (id.isBlank()) return@mapNotNull null
            HubMindFirestoreDocument(
                id = id,
                fields = decodeFields(doc.optJSONObject("fields") ?: JSONObject()),
                updateTime = doc.optString("updateTime").takeIf { it.isNotBlank() }
            )
        }
    }

    fun updateDeviceCommand(
        userId: String,
        commandId: String,
        values: Map<String, Any?>,
        bearerToken: String
    ) {
        val body = JSONObject().put("fields", firestoreFields(values))
        val mask = values.keys.joinToString("&") { "updateMask.fieldPaths=${encodePathSegment(it)}" }
        request(documentPath(userId, "deviceCommands", commandId) + "?$mask", "PATCH", bearerToken, body)
    }
}
