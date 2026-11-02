package com.example.hubmind.data.updater

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import com.example.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

data class AppUpdateManifest(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val releaseNotes: String,
    val sha256: String,
    val minSupportedVersionCode: Int = 1
)

class HubMindUpdateChecker(private val context: Context) {

    companion object {
        private const val MAX_APK_SIZE_BYTES = 250L * 1024L * 1024L
    }

    private val currentVersionCode: Int
        get() = runCatching {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode
            }
        }.getOrDefault(1)

    private val manifestUrl: String
        get() = BuildConfig.HUBMIND_API_BASE_URL.trimEnd('/') + "/app-version.json"

    suspend fun checkForUpdate(): AppUpdateManifest? = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            val url = URL(manifestUrl)
            require(url.protocol == "https") { "Update manifest must use HTTPS." }
            connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")

            if (connection.responseCode !in 200..299) return@withContext null

            val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            val remoteCode = json.optInt("versionCode", 0)
            val apkUrl = json.optString("apkUrl", "")
            val sha256 = json.optString("sha256", "").lowercase()

            if (remoteCode <= currentVersionCode || apkUrl.isBlank()) return@withContext null
            if (!isTrustedDownloadUrl(apkUrl)) return@withContext null
            if (!sha256.matches(Regex("^[a-f0-9]{64}$"))) return@withContext null

            AppUpdateManifest(
                versionCode = remoteCode,
                versionName = json.optString("versionName", remoteCode.toString()),
                apkUrl = apkUrl,
                releaseNotes = json.optString("releaseNotes", "Hub-Mind update."),
                sha256 = sha256,
                minSupportedVersionCode = json.optInt("minSupportedVersionCode", 1)
            )
        } catch (_: Exception) {
            null
        } finally {
            connection?.disconnect()
        }
    }

    suspend fun downloadUpdate(manifest: AppUpdateManifest): File = withContext(Dispatchers.IO) {
        require(manifest.versionCode > currentVersionCode) { "This update is not newer than the installed version." }
        require(isTrustedDownloadUrl(manifest.apkUrl)) { "APK download URL is not trusted." }
        require(manifest.sha256.matches(Regex("^[a-f0-9]{64}$"))) { "The update manifest does not contain a valid SHA-256 checksum." }

        val downloadDirectory = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            ?: File(context.cacheDir, "updates")
        if (!downloadDirectory.exists() && !downloadDirectory.mkdirs()) {
            throw IOException("Could not create the private update download directory.")
        }

        val finalFile = File(downloadDirectory, "hubmind-" + manifest.versionCode + ".apk")
        val temporaryFile = File(downloadDirectory, finalFile.name + ".part")
        var connection: HttpURLConnection? = null

        try {
            val url = URL(manifest.apkUrl)
            connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 15000
            connection.readTimeout = 120000
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive")

            val status = connection.responseCode
            if (status !in 200..299) throw IOException("APK download failed with HTTP " + status + ".")

            val declaredLength = connection.contentLengthLong
            if (declaredLength > MAX_APK_SIZE_BYTES) throw IOException("APK exceeds the 250 MB download limit.")

            val digest = MessageDigest.getInstance("SHA-256")
            var totalBytes = 0L
            connection.inputStream.use { input ->
                temporaryFile.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        totalBytes += count
                        if (totalBytes > MAX_APK_SIZE_BYTES) {
                            throw IOException("APK exceeds the 250 MB download limit.")
                        }
                        digest.update(buffer, 0, count)
                        output.write(buffer, 0, count)
                    }
                }
            }

            if (totalBytes < 4) throw IOException("Downloaded file is too small to be an APK.")
            val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
            if (!actualHash.equals(manifest.sha256, ignoreCase = true)) {
                throw IOException("APK checksum does not match the signed release manifest.")
            }
            temporaryFile.inputStream().use { input ->
                val signature = ByteArray(4)
                if (input.read(signature) != 4 ||
                    signature[0] != 0x50.toByte() || signature[1] != 0x4b.toByte()
                ) {
                    throw IOException("Downloaded file is not a valid APK/ZIP package.")
                }
            }

            if (finalFile.exists() && !finalFile.delete()) {
                throw IOException("Could not replace the previous downloaded update.")
            }
            if (!temporaryFile.renameTo(finalFile)) {
                throw IOException("Could not finalise the downloaded APK.")
            }
            finalFile
        } catch (error: Exception) {
            temporaryFile.delete()
            throw error
        } finally {
            connection?.disconnect()
        }
    }

    fun promptPackageInstall(apkFile: File) {
        require(apkFile.isFile && apkFile.length() > 0L) { "APK file does not exist or is empty." }
        require(isAppOwnedUpdateFile(apkFile)) { "Only APK files downloaded into Hub-Mind's private update directory can be installed." }

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O &&
            !context.packageManager.canRequestPackageInstalls()
        ) {
            val settingsIntent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.packageName)
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(settingsIntent)
            return
        }

        val uri = FileProvider.getUriForFile(
            context,
            context.packageName + ".fileprovider",
            apkFile
        )
        val installIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            data = uri
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(installIntent)
    }

    private fun isTrustedDownloadUrl(value: String): Boolean = runCatching {
        val candidate = URL(value)
        val configuredHost = URL(BuildConfig.HUBMIND_API_BASE_URL).host
        candidate.protocol == "https" &&
            candidate.host.equals(configuredHost, ignoreCase = true) &&
            (candidate.port == -1 || candidate.port == 443) &&
            candidate.userInfo == null
    }.getOrDefault(false)

    private fun isAppOwnedUpdateFile(file: File): Boolean {
        val canonical = runCatching { file.canonicalFile }.getOrNull() ?: return false
        val externalDirectory = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            ?.let { runCatching { it.canonicalFile }.getOrNull() }
        val cacheDirectory = File(context.cacheDir, "updates")
            .let { runCatching { it.canonicalFile }.getOrNull() }
        return listOfNotNull(externalDirectory, cacheDirectory).any { parent ->
            canonical.parentFile == parent
        }
    }
}
