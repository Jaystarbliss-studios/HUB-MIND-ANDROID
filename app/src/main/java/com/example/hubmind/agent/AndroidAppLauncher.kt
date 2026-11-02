package com.example.hubmind.agent

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager

class AndroidAppLauncher(private val context: Context) {

    fun getInstalledApplications(): List<AppInfo> {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val resolveInfos = pm.queryIntentActivities(intent, 0)

        return resolveInfos.map { resolveInfo ->
            val appName = resolveInfo.loadLabel(pm).toString()
            val packageName = resolveInfo.activityInfo.packageName
            val isSystem = (resolveInfo.activityInfo.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
            AppInfo(packageName = packageName, appName = appName, isSystemApp = isSystem)
        }.sortedBy { it.appName }
    }

    fun findAppByName(queryName: String): AppInfo? {
        val apps = getInstalledApplications()
        return apps.find { it.appName.equals(queryName, ignoreCase = true) }
            ?: apps.find { it.appName.contains(queryName, ignoreCase = true) }
            ?: apps.find { it.packageName.contains(queryName, ignoreCase = true) }
    }

    fun launchAppByPackage(packageName: String): Boolean {
        return try {
            val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return false
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }
}
