package com.example.hubmind.voice

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.AudioManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import com.example.BuildConfig
import com.example.hubmind.data.model.JessLiveState
import com.example.hubmind.data.model.LiveConnectionState
import com.example.hubmind.data.repository.AuthRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume

/**
 * Native Android Gemini Live client.
 *
 * The permanent Gemini API key stays on the Hub-Mind server. This client first
 * authenticates the signed-in user against /api/live-token, then uses the
 * short-lived token for the constrained Live WebSocket connection.
 */
class GeminiLiveVoiceSession(
    private val context: Context,
    private val authRepository: AuthRepository,
    private val onConnectionState: (LiveConnectionState) -> Unit,
    private val onJessState: (JessLiveState) -> Unit,
    private val onUserTranscript: (String) -> Unit,
    private val onJessTranscript: (String) -> Unit,
    private val onError: (String) -> Unit
) {
    private val appContext = context.applicationContext
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var socket: WebSocket? = null
    private var audioRecord: AudioRecord? = null
    private var audioTrack: AudioTrack? = null
    private var captureJob: Job? = null
    private val isClosed = AtomicBoolean(false)
    private val isReady = AtomicBoolean(false)
    private var setupComplete: kotlinx.coroutines.CompletableDeferred<Boolean>? = null

    suspend fun connect(userName: String, userRole: String, systemContext: String = ""): Boolean {
        if (isReady.get()) return true
        if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            onError("Microphone permission is required before Jess can start a Live voice session.")
            return false
        }

        isClosed.set(false)
        isReady.set(false)
        onConnectionState(LiveConnectionState.CONNECTING)
        onJessState(JessLiveState.THINKING)

        return try {
            val idToken = authRepository.getIdToken()
                ?: throw IllegalStateException("Your Hub-Mind sign-in session is unavailable. Sign in again.")
            val ephemeralToken = fetchEphemeralToken(idToken)
            val ready = kotlinx.coroutines.CompletableDeferred<Boolean>()
            setupComplete = ready

            val request = Request.Builder()
                .url("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained")
                .header("Authorization", "Token $ephemeralToken")
                .build()

            socket = client.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    val setup = JSONObject()
                        .put("model", "models/gemini-3.8-live")
                        .put("generationConfig", JSONObject()
                            .put("responseModalities", JSONArray().put("AUDIO"))
                            .put("speechConfig", JSONObject()
                                .put("voiceConfig", JSONObject()
                                    .put("prebuiltVoiceConfig", JSONObject().put("voiceName", "Kore")))))
                        .put("systemInstruction", JSONObject().put("parts", JSONArray().put(
                            JSONObject().put("text", buildSystemInstruction(userName, userRole, systemContext))
                        )))
                        .put("inputAudioTranscription", JSONObject())
                        .put("outputAudioTranscription", JSONObject())
                        .put("contextWindowCompression", JSONObject().put("slidingWindow", JSONObject()))
                    webSocket.send(JSONObject().put("setup", setup).toString())
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    handleServerMessage(webSocket, text)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    isReady.set(false)
                    setupComplete?.let { if (!it.isCompleted) it.complete(false) }
                    onConnectionState(LiveConnectionState.ERROR)
                    onJessState(JessLiveState.ERROR)
                    onError(t.message ?: "Gemini Live connection failed.")
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    isReady.set(false)
                    stopAudio()
                    onConnectionState(LiveConnectionState.DISCONNECTED)
                    onJessState(JessLiveState.IDLE)
                }
            })

            val connected = withContext(Dispatchers.IO) {
                kotlinx.coroutines.withTimeoutOrNull(30_000) { ready.await() } ?: false
            }
            if (!connected) {
                disconnect()
                if (setupComplete?.isCompleted == false) {
                    onError("Gemini Live did not complete its session setup. Please try again.")
                }
            }
            connected
        } catch (error: Exception) {
            onConnectionState(LiveConnectionState.ERROR)
            onJessState(JessLiveState.ERROR)
            onError(error.message ?: "Could not start Jess Live.")
            disconnect()
            false
        }
    }

    private suspend fun fetchEphemeralToken(idToken: String): String = withContext(Dispatchers.IO) {
        val baseUrl = BuildConfig.HUBMIND_API_BASE_URL.trimEnd('/')
        require(baseUrl.startsWith("https://")) { "Hub-Mind API must use HTTPS." }
        val connection = (URL("$baseUrl/api/live-token").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 12_000
            readTimeout = 15_000
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer $idToken")
        }
        try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(body) }.getOrNull()
            require(status in 200..299) {
                json?.optString("error")?.takeIf { it.isNotBlank() }
                    ?: "Hub-Mind Live token service returned HTTP $status."
            }
            json?.optString("token")?.takeIf { it.isNotBlank() }
                ?: throw IllegalStateException("Hub-Mind did not return a Gemini Live token.")
        } finally {
            connection.disconnect()
        }
    }

    private fun buildSystemInstruction(userName: String, userRole: String, systemContext: String): String = buildString {
        append("You are Jess, the user's personal assistant inside Hub-Mind. ")
        append("The signed-in user is ").append(userName.ifBlank { "the Hub-Mind account owner" })
            .append(" and their role is ").append(userRole.ifBlank { "member" }).append(". ")
        append("Speak naturally and concisely. You are connected to the same Hub-Mind Gemini Live backend as the desktop client. ")
        append("Do not claim that you performed an action unless a connected tool returns a successful result. ")
        append("This Android Live session currently has voice input and output. Device-control tools will be exposed only when the native agent is connected and its permissions are granted.")
        if (systemContext.isNotBlank()) append("\n\nHub-Mind context:\n").append(systemContext)
    }

    private fun handleServerMessage(webSocket: WebSocket, raw: String) {
        try {
            val message = JSONObject(raw)
            if (message.has("setupComplete")) {
                isReady.set(true)
                onConnectionState(LiveConnectionState.CONNECTED)
                onJessState(JessLiveState.LISTENING)
                startAudioCapture()
                setupComplete?.let { if (!it.isCompleted) it.complete(true) }
                return
            }

            val serverContent = message.optJSONObject("serverContent")
            if (serverContent != null) {
                serverContent.optJSONObject("inputTranscription")?.optString("text")
                    ?.takeIf { it.isNotBlank() }?.let(onUserTranscript)
                serverContent.optJSONObject("outputTranscription")?.optString("text")
                    ?.takeIf { it.isNotBlank() }?.let(onJessTranscript)

                if (serverContent.optBoolean("interrupted")) {
                    audioTrack?.pause()
                    audioTrack?.flush()
                    audioTrack?.play()
                    onJessState(JessLiveState.INTERRUPTED)
                }

                val parts = serverContent.optJSONObject("modelTurn")?.optJSONArray("parts")
                if (parts != null) {
                    for (index in 0 until parts.length()) {
                        val part = parts.optJSONObject(index) ?: continue
                        val inlineData = part.optJSONObject("inlineData") ?: continue
                        val encoded = inlineData.optString("data")
                        if (encoded.isNotBlank()) playAudio(encoded)
                    }
                }

                if (serverContent.optBoolean("turnComplete")) {
                    onJessState(JessLiveState.LISTENING)
                } else if (parts != null && parts.length() > 0) {
                    onJessState(JessLiveState.SPEAKING)
                }
            }

            if (message.has("error")) {
                val detail = message.optJSONObject("error")?.optString("message")
                    ?: "Gemini Live returned an error."
                onError(detail)
                onJessState(JessLiveState.ERROR)
            }
        } catch (error: Exception) {
            onError("Could not process a Gemini Live response: ${error.message ?: "invalid message"}.")
        }
    }

    private fun startAudioCapture() {
        if (captureJob?.isActive == true || isClosed.get()) return
        val sampleRate = 16_000
        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuffer <= 0) {
            onError("This device does not support the required 16 kHz microphone format.")
            return
        }

        val recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuffer * 2, 4096)
        )
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            onError("Android could not initialise the microphone.")
            return
        }
        audioRecord = recorder
        recorder.startRecording()
        captureJob = scope.launch {
            val buffer = ByteArray(2048)
            try {
                while (isActive && !isClosed.get() && isReady.get()) {
                    val count = recorder.read(buffer, 0, buffer.size)
                    if (count > 0) {
                        val frame = if (count == buffer.size) buffer.copyOf() else buffer.copyOf(count)
                        val audio = JSONObject()
                            .put("mimeType", "audio/pcm;rate=16000")
                            .put("data", Base64.encodeToString(frame, Base64.NO_WRAP))
                        socket?.send(JSONObject().put("realtimeInput", JSONObject().put("audio", audio)).toString())
                    } else if (count < 0) {
                        throw IllegalStateException("Android microphone read failed ($count).")
                    }
                }
            } catch (error: Exception) {
                if (!isClosed.get()) onError(error.message ?: "Microphone streaming stopped.")
            }
        }
    }

    private fun playAudio(encoded: String) {
        try {
            val pcm = Base64.decode(encoded, Base64.DEFAULT)
            val minBuffer = AudioTrack.getMinBufferSize(
                24_000,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            if (minBuffer <= 0) return
            var track = audioTrack
            if (track == null) {
                track = AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANT)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(24_000)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build()
                    )
                    .setBufferSizeInBytes(maxOf(minBuffer * 2, 8192))
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build()
                audioTrack = track
                track.play()
            }
            track.write(pcm, 0, pcm.size)
        } catch (error: Exception) {
            onError("Jess audio playback failed: ${error.message ?: "unknown audio error"}.")
        }
    }

    fun sendText(text: String): Boolean {
        if (!isReady.get() || text.isBlank()) return false
        onJessState(JessLiveState.THINKING)
        return socket?.send(
            JSONObject().put("realtimeInput", JSONObject().put("text", text)).toString()
        ) ?: false
    }

    suspend fun disconnect() {
        if (!isClosed.compareAndSet(false, true)) return
        isReady.set(false)
        stopAudio()
        socket?.close(1000, "User ended Jess Live session")
        socket = null
        onConnectionState(LiveConnectionState.DISCONNECTED)
        onJessState(JessLiveState.IDLE)
    }

    private fun stopAudio() {
        captureJob?.cancel()
        captureJob = null
        runCatching {
            audioRecord?.stop()
            audioRecord?.release()
        }
        audioRecord = null
        runCatching {
            audioTrack?.pause()
            audioTrack?.flush()
            audioTrack?.stop()
            audioTrack?.release()
        }
        audioTrack = null
    }

    fun dispose() {
        scope.launch { disconnect() }
        scope.cancel()
        client.dispatcher.executorService.shutdown()
    }
}
