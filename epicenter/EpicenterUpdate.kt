// EpicenterUpdate.kt: copy this one file into your Android app and ask Epicenter whether a newer version exists.
// No libraries needed. Docs: https://oeper.dev/epicenter/developers
//
//   EpicenterUpdate.check(this, "com.example.app") { update ->
//       if (update != null) showDialog("Version ${update.version} is available", update.notes) { EpicenterUpdate.open(this, update) }
//   }
//
// Add <uses-permission android:name="android.permission.INTERNET"/> and, to find the Epicenter app, a <queries> entry:
//   <queries><intent><action android:name="android.intent.action.VIEW"/><data android:scheme="epicenter"/></intent></queries>
package dev.oeper.epicenter.sdk

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

object EpicenterUpdate {
    private const val API = "https://oeper-ai.oeper.workers.dev/api/epicenter/latest"

    data class Update(
        val id: String, val version: String?, val versionCode: Long, val notes: String,
        val url: String, val sha256: String?, val page: String, val deeplink: String,
    )

    /**
     * Asks Epicenter for the newest release of [appId] (your package name). [done] runs on the main thread with the update when it is
     * newer than the installed app, or null (up to date, offline, or not listed). Call it from a launch screen; it never throws.
     */
    fun check(context: Context, appId: String, done: (Update?) -> Unit) {
        val app = context.applicationContext
        val main = Handler(Looper.getMainLooper())
        thread(name = "epicenter-update") {
            val result = try { fetch(app, appId) } catch (_: Exception) { null }
            main.post { done(result) }
        }
    }

    private fun fetch(context: Context, appId: String): Update? {
        val conn = URL("$API?id=${Uri.encode(appId)}&platform=android").openConnection() as HttpURLConnection
        conn.connectTimeout = 8000; conn.readTimeout = 8000
        try {
            if (conn.responseCode != 200) return null
            val j = JSONObject(conn.inputStream.bufferedReader().readText())
            val remoteCode = j.optLong("versionCode", 0)
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            val installed = if (android.os.Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
            if (remoteCode <= installed) return null
            return Update(
                id = j.getString("id"), version = j.optString("version").ifEmpty { null }, versionCode = remoteCode, notes = j.optString("notes"),
                url = j.getString("url"), sha256 = j.optString("sha256").ifEmpty { null }, page = j.getString("page"), deeplink = j.getString("deeplink"),
            )
        } finally { conn.disconnect() }
    }

    /** Opens the update in the Epicenter app when it is installed (one tap to update), otherwise on its page at oeper.dev/epicenter. */
    fun open(context: Context, update: Update) {
        val epicenter = Intent(Intent.ACTION_VIEW, Uri.parse(update.deeplink)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val intent = if (epicenter.resolveActivity(context.packageManager) != null) epicenter
        else Intent(Intent.ACTION_VIEW, Uri.parse(update.page)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }
}
