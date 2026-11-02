package com.example.hubmind.agent

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context

class AndroidClipboardController(private val context: Context) {

    fun setClipboardText(label: String = "HubMind", text: String): Boolean {
        return try {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return false
            val clip = ClipData.newPlainText(label, text)
            cm.setPrimaryClip(clip)
            true
        } catch (e: Exception) {
            false
        }
    }

    fun getClipboardText(): String? {
        return try {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return null
            val clip = cm.primaryClip
            if (clip != null && clip.itemCount > 0) {
                clip.getItemAt(0).text?.toString()
            } else null
        } catch (e: Exception) {
            null
        }
    }
}
