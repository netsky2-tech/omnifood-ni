package com.nhilos.pos_app

import android.content.Intent
import com.nhilos.pos_app.installer.ApkInstallHandler
import com.nhilos.pos_app.printer.IPosPrinterHandler
import com.nhilos.pos_app.printer.SunmiPrinterHandler
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    companion object {
        private const val APP_LINKS_CHANNEL = "com.nhilos.pos_app/app_links"
    }

    private var sunmiPrinterHandler: SunmiPrinterHandler? = null
    private var iPosPrinterHandler: IPosPrinterHandler? = null
    private var apkInstallHandler: ApkInstallHandler? = null
    private var appLinksChannel: MethodChannel? = null
    private var initialLink: String? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        sunmiPrinterHandler = SunmiPrinterHandler(applicationContext).apply {
            register(flutterEngine.dartExecutor.binaryMessenger)
        }
        iPosPrinterHandler = IPosPrinterHandler(applicationContext).apply {
            register(flutterEngine.dartExecutor.binaryMessenger)
        }
        apkInstallHandler = ApkInstallHandler(applicationContext).apply {
            register(flutterEngine.dartExecutor.binaryMessenger)
        }

        initialLink = intent?.dataString
        appLinksChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            APP_LINKS_CHANNEL
        ).apply {
            setMethodCallHandler { call, result ->
                when (call.method) {
                    "getInitialLink" -> {
                        val link = initialLink
                        initialLink = null
                        result.success(link)
                    }
                    else -> result.notImplemented()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val dataString = intent.dataString
        if (!dataString.isNullOrBlank()) {
            appLinksChannel?.invokeMethod("onNewLink", dataString)
        }
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        sunmiPrinterHandler?.unregister()
        sunmiPrinterHandler = null
        iPosPrinterHandler?.unregister()
        iPosPrinterHandler = null
        apkInstallHandler?.unregister()
        apkInstallHandler = null
        appLinksChannel?.setMethodCallHandler(null)
        appLinksChannel = null
        super.cleanUpFlutterEngine(flutterEngine)
    }
}
