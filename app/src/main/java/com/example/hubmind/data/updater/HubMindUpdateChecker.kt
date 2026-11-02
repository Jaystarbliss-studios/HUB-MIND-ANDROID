package com.example.hubmind.data.updater

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class AppUpdateManifest(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val releaseNotes: String,
    val minSupportedVersionCode: Int = 1
)

class HubMindUpdateChecker(private val context: Context) {

    private val currentVersionCode: Int = 240
    private val manifestUrl = "https://hub-mind.netlify.app/api/app-version.json"

    suspend fun checkForUpdate(): AppUpdateManifest? = withContext(Dispatchers.IO) {
        return@withContext try {
            val url = URL(manifestUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.requestMethod = "GET"

            if (connection.responseCode == 200) {
                val jsonStr = connection.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(jsonStr)
                val remoteCode = json.optInt("versionCode", 0)
                if (remoteCode > currentVersionCode) {
                    AppUpdateManifest(
                        versionCode = remoteCode,
                        versionName = json.optString("versionName", "2.5.0"),
                        apkUrl = json.optString("apkUrl", "https://hub-mind.netlify.app/downloads/hubmind-release.apk"),
                        releaseNotes = json.optString("releaseNotes", "New feature updates and performance improvements for Hub-Mind."),
                        minSupportedVersionCode = json.optInt("minSupportedVersionCode", 1)
                    )
                } else null
            } else null
        } catch (e: Exception) {
            null
        }
    }

    fun promptPackageInstall(apkFile: File) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
            } else {
                Uri.fromFile(apkFile)
            }
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
