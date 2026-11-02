package com.example.hubmind.agent

import android.accessibilityservice.AccessibilityService

class AndroidGlobalActionController {

    fun performBack(): Boolean {
        val service = HubMindAccessibilityService.getInstance() ?: return false
        return service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
    }

    fun performHome(): Boolean {
        val service = HubMindAccessibilityService.getInstance() ?: return false
        return service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
    }

    fun performRecents(): Boolean {
        val service = HubMindAccessibilityService.getInstance() ?: return false
        return service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS)
    }

    fun performNotifications(): Boolean {
        val service = HubMindAccessibilityService.getInstance() ?: return false
        return service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS)
    }

    fun performQuickSettings(): Boolean {
        val service = HubMindAccessibilityService.getInstance() ?: return false
        return service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS)
    }
}
