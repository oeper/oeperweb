// EpicenterUpdate.kt: copy this one file into your Android app. It asks Epicenter whether a newer version exists and can install it itself.
// No libraries needed. Docs: https://oeper.dev/epicenter/developers
//
//   EpicenterUpdate.check(this, "com.example.app") { update ->
//       if (update != null) showDialog("Version ${update.version} is available", update.notes) {
//           EpicenterUpdate.install(this, update) { state -> /* Downloading(percent), Verifying, Installing, NeedsPermission, Failed(reason) */ }
//       }
//   }
//
// install() downloads the new APK, checks its SHA-256 and that it is the same app, then hands it to Android's installer.
// The Epicenter app does NOT have to be installed. Add to your manifest:
//   <uses-permission android:name="android.permission.INTERNET"/>
//   <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>
// Optional, only for open() (finds the Epicenter app):
//   <queries><intent><action android:name="android.intent.action.VIEW"/><data android:scheme="epicenter"/></intent></queries>
// The update must be signed with the same key as the installed app, or Android refuses it.
package dev.oeper.epicenter.sdk

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.concurrent.thread

object EpicenterUpdate {
    private const val API = "https://oeper-ai.oeper.workers.dev/api/epicenter/latest"

    data class Update(
        val id: String, val version: String?, val versionCode: Long, val notes: String,
        val url: String, val sha256: String?, val page: String, val deeplink: String, val format: String = "apk",
    )

    /** What install() reports. NeedsPermission: Android's "install unknown apps" screen was opened; call install() again once the person is back. */
    sealed interface State {
        data class Downloading(val percent: Int) : State
        object Verifying : State
        object Installing : State
        object NeedsPermission : State
        data class Failed(val reason: String) : State
    }

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
            val installed = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
            if (remoteCode <= installed) return null
            return Update(
                id = j.getString("id"), version = j.optString("version").ifEmpty { null }, versionCode = remoteCode, notes = j.optString("notes"),
                url = j.getString("url"), sha256 = j.optString("sha256").ifEmpty { null }, page = j.getString("page"), deeplink = j.getString("deeplink"),
                format = j.optString("format").ifEmpty { "apk" },
            )
        } finally { conn.disconnect() }
    }

    /**
     * Downloads [update], checks it and starts Android's installer. [onState] runs on the main thread. When the install finishes Android restarts
     * the app, so there is no "done" state. Android shows its own confirm screen (except for an update of an app this same installer put there).
     */
    fun install(context: Context, update: Update, onState: (State) -> Unit) {
        val app = context.applicationContext
        val main = Handler(Looper.getMainLooper())
        fun say(s: State) { main.post { onState(s) } }
        if (update.format != "apk") { main.post { open(app, update) }; return }   // bundles (apks, xapk) need the Epicenter app
        if (Build.VERSION.SDK_INT >= 26 && !app.packageManager.canRequestPackageInstalls()) {
            app.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + app.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            say(State.NeedsPermission); return
        }
        thread(name = "epicenter-install") {
            val file = File(app.cacheDir, "epicenter-update.apk")
            try {
                download(update.url, file) { say(State.Downloading(it)) }
                say(State.Verifying)
                val want = update.sha256
                if (want != null) {
                    val md = MessageDigest.getInstance("SHA-256")
                    file.inputStream().use { i -> val b = ByteArray(65536); while (true) { val n = i.read(b); if (n < 0) break; md.update(b, 0, n) } }
                    if (!md.digest().joinToString("") { "%02x".format(it) }.equals(want, ignoreCase = true)) throw IllegalStateException("The download does not match its checksum.")
                }
                val info = app.packageManager.getPackageArchiveInfo(file.path, 0) ?: throw IllegalStateException("The download is not an app.")
                if (info.packageName != app.packageName) throw IllegalStateException("The download is a different app.")
                say(State.Installing)
                commit(app, file) { say(State.Failed(it)) }
            } catch (e: Exception) {
                file.delete()
                say(State.Failed(e.message ?: "The update failed."))
            }
        }
    }

    /** Opens the update in the Epicenter app when it is installed, otherwise on its page at oeper.dev/epicenter. */
    fun open(context: Context, update: Update) {
        val epicenter = Intent(Intent.ACTION_VIEW, Uri.parse(update.deeplink)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val intent = if (epicenter.resolveActivity(context.packageManager) != null) epicenter
        else Intent(Intent.ACTION_VIEW, Uri.parse(update.page)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    private fun download(url: String, to: File, progress: (Int) -> Unit) {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000; conn.readTimeout = 30000; conn.instanceFollowRedirects = true
        try {
            if (conn.responseCode != 200) throw IllegalStateException("The download failed (HTTP ${conn.responseCode}).")
            val total = conn.contentLengthLong; var done = 0L; var last = -1
            conn.inputStream.use { i ->
                to.outputStream().use { o ->
                    val b = ByteArray(65536)
                    while (true) {
                        val n = i.read(b); if (n < 0) break
                        o.write(b, 0, n); done += n
                        if (total > 0) { val p = (done * 100 / total).toInt(); if (p != last) { last = p; progress(p) } }
                    }
                }
            }
        } finally { conn.disconnect() }
    }

    private fun commit(app: Context, file: File, onFail: (String) -> Unit) {
        val installer = app.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(app.packageName)
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            file.inputStream().use { i -> session.openWrite("update.apk", 0, file.length()).use { o -> i.copyTo(o); session.fsync(o) } }
            val action = app.packageName + ".EPICENTER_INSTALL"
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context, intent: Intent) {
                    when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                        PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                            @Suppress("DEPRECATION") val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                            if (confirm != null) c.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        }
                        PackageInstaller.STATUS_SUCCESS -> { file.delete(); c.applicationContext.unregisterReceiver(this) }
                        else -> { file.delete(); c.applicationContext.unregisterReceiver(this); onFail(intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "Android could not install the update.") }
                    }
                }
            }
            if (Build.VERSION.SDK_INT >= 33) app.registerReceiver(receiver, IntentFilter(action), Context.RECEIVER_NOT_EXPORTED)
            else app.registerReceiver(receiver, IntentFilter(action))
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            session.commit(PendingIntent.getBroadcast(app, id, Intent(action).setPackage(app.packageName), flags).intentSender)
        }
    }
}
