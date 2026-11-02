package com.example.hubmind

import android.app.Application
import com.example.hubmind.di.ServiceLocator

class HubMindApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ServiceLocator.initialize(this)
    }
}
