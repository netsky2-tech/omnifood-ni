package com.omnifood.pos_app

import com.omnifood.pos_app.printer.SunmiPrinterHandler
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {
    private var printerHandler: SunmiPrinterHandler? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        printerHandler = SunmiPrinterHandler(applicationContext).apply {
            register(flutterEngine.dartExecutor.binaryMessenger)
        }
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        printerHandler?.unregister()
        printerHandler = null
        super.cleanUpFlutterEngine(flutterEngine)
    }
}
