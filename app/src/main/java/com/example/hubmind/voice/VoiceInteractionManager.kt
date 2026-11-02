package com.example.hubmind.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import com.example.hubmind.data.model.JessLiveState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale

class VoiceInteractionManager(private val context: Context) : TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private var isTtsReady = false

    private val _liveState = MutableStateFlow(JessLiveState.IDLE)
    val liveState: StateFlow<JessLiveState> = _liveState.asStateFlow()

    private val _partialTranscript = MutableStateFlow("")
    val partialTranscript: StateFlow<String> = _partialTranscript.asStateFlow()

    init {
        tts = TextToSpeech(context, this)
        if (SpeechRecognizer.isRecognitionAvailable(context)) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
            isTtsReady = true
        }
    }

    fun startListening(onResult: (String) -> Unit) {
        stopSpeaking()
        _liveState.value = JessLiveState.LISTENING
        _partialTranscript.value = ""

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.US)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }

        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {
                _liveState.value = JessLiveState.THINKING
            }

            override fun onError(error: Int) {
                _liveState.value = JessLiveState.IDLE
            }

            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val text = matches?.firstOrNull() ?: ""
                _partialTranscript.value = text
                _liveState.value = JessLiveState.THINKING
                onResult(text)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                matches?.firstOrNull()?.let {
                    _partialTranscript.value = it
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        speechRecognizer?.startListening(intent)
    }

    fun speakResponse(text: String, onComplete: () -> Unit = {}) {
        if (!isTtsReady) return
        _liveState.value = JessLiveState.SPEAKING
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "jess_tts_id")
    }

    fun stopSpeaking() {
        if (tts?.isSpeaking == true) {
            tts?.stop()
        }
        if (_liveState.value == JessLiveState.SPEAKING) {
            _liveState.value = JessLiveState.IDLE
        }
    }

    fun cancelSession() {
        stopSpeaking()
        speechRecognizer?.stopListening()
        _liveState.value = JessLiveState.IDLE
        _partialTranscript.value = ""
    }

    fun destroy() {
        tts?.shutdown()
        speechRecognizer?.destroy()
    }
}
