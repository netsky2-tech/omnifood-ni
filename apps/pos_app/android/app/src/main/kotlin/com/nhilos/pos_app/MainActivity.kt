package com.nhilos.pos_app

import com.nhilos.pos_app.installer.ApkInstallHandler
import com.nhilos.pos_app.printer.IPosPrinterHandler
import com.nhilos.pos_app.printer.SunmiPrinterHandler
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {
    private var sunmiPrinterHandler: SunmiPrinterHandler? = null
    private var iPosPrinterHandler: IPosPrinterHandler? = null
    private var apkInstallHandler: ApkInstallHandler? = null

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
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        sunmiPrinterHandler?.unregister()
        sunmiPrinterHandler = null
        iPosPrinterHandler?.unregister()
        iPosPrinterHandler = null
        apkInstallHandler?.unregister()
        apkInstallHandler = null
        super.cleanUpFlutterEngine(flutterEngine)
    }
}
