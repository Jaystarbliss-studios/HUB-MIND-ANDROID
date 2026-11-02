package com.example.hubmind.voice

import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

class HubMindVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
    }
}

class HubMindVoiceInteractionSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession {
        return HubMindVoiceSession(this)
    }
}

class HubMindVoiceSession(context: android.content.Context) : VoiceInteractionSession(context) {
    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        // Invoked when long-pressing Home button or triggering assistant gesture
    }
}
