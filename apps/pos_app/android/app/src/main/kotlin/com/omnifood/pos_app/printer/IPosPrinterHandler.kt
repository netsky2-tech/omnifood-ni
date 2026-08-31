package com.omnifood.pos_app.printer

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import com.iposprinter.iposprinterservice.IPosPrinterService
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Native Android MethodChannel handler for Alacrity Q80 and iPos-compatible thermal printers.
 * Connects to the standard iPos AIDL service (com.iposprinter.iposprinterservice) with
 * graceful fallback for non-Q80 devices — mirrors the SunmiPrinterHandler pattern.
 */
class IPosPrinterHandler(private val context: Context) : MethodChannel.MethodCallHandler {
    companion object {
        private const val TAG = "OmniFoodIPosPrinterNative"
        private const val CHANNEL_NAME = "com.omnifood.pos/ipos_printer"
        private const val SERVICE_PACKAGE = "com.iposprinter.iposprinterservice"
        private const val SERVICE_ACTION = "com.iposprinter.iposprinterservice.IPosPrinterService"
    }

    private var channel: MethodChannel? = null
    private var iPosPrinterService: IPosPrinterService? = null
    private var isBound = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            iPosPrinterService = IPosPrinterService.Stub.asInterface(service)
            isBound = true
            Log.i(TAG, "iPos Printer Service connected successfully.")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            iPosPrinterService = null
            isBound = false
            Log.w(TAG, "iPos Printer Service disconnected.")
        }
    }

    fun register(messenger: BinaryMessenger) {
        channel = MethodChannel(messenger, CHANNEL_NAME).apply {
            setMethodCallHandler(this@IPosPrinterHandler)
        }
        connectService()
    }

    fun unregister() {
        channel?.setMethodCallHandler(null)
        channel = null
        disconnectService()
    }

    private fun connectService() {
        try {
            val intent = Intent().apply {
                setPackage(SERVICE_PACKAGE)
                setAction(SERVICE_ACTION)
            }
            val bound = context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
            if (!bound) {
                Log.d(TAG, "iPos Printer Service not present on this device (Standard Android / Non-Q80). Fallback mode active.")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Exception while attempting to bind iPos Printer Service: ${e.message}. Fallback mode active.")
        }
    }

    private fun disconnectService() {
        if (isBound) {
            try {
                context.unbindService(serviceConnection)
                isBound = false
                iPosPrinterService = null
            } catch (e: Exception) {
                Log.w(TAG, "Exception unbinding iPos service: ${e.message}")
            }
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getPrinterStatus" -> handleGetPrinterStatus(result)
            "printRawBytes" -> handlePrintRawBytes(call, result)
            "printText" -> handlePrintText(call, result)
            "openDrawer" -> handleOpenDrawer(result)
            else -> result.notImplemented()
        }
    }

    private fun handleGetPrinterStatus(result: MethodChannel.Result) {
        val service = iPosPrinterService
        if (service == null) {
            // Non-Q80 device (e.g. Samsung, emulator) — return READY for simulation fallback
            Log.d(TAG, "getPrinterStatus called without active iPos service. Returning READY fallback.")
            result.success("READY")
            return
        }

        try {
            val status = service.printerStatus
            val statusString = when (status) {
                0 -> "READY"
                1 -> "OUT_OF_PAPER"
                2 -> "OVERHEATING"
                3 -> "BUSY"
                4 -> "OFFLINE"
                else -> "READY"
            }
            Log.d(TAG, "iPos native printer status: $status -> $statusString")
            result.success(statusString)
        } catch (e: Exception) {
            Log.e(TAG, "Error querying iPos printer status: ${e.message}", e)
            result.error("STATUS_ERROR", e.message, null)
        }
    }

    private fun handlePrintRawBytes(call: MethodCall, result: MethodChannel.Result) {
        val bytes = call.argument<ByteArray>("bytes")
        if (bytes == null || bytes.isEmpty()) {
            result.error("INVALID_ARGS", "Bytes array is empty or null", null)
            return
        }

        val service = iPosPrinterService
        if (service == null) {
            Log.d(TAG, "printRawBytes (${bytes.size} bytes) simulated on non-Q80 device.")
            result.success(true)
            return
        }

        try {
            service.printRawData(bytes, null)
            result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending raw bytes to iPos printer: ${e.message}", e)
            result.error("PRINT_ERROR", e.message, null)
        }
    }

    private fun handlePrintText(call: MethodCall, result: MethodChannel.Result) {
        val text = call.argument<String>("text")
        if (text == null) {
            result.error("INVALID_ARGS", "Text argument is null", null)
            return
        }

        val service = iPosPrinterService
        if (service == null) {
            Log.d(TAG, "printText simulated on non-Q80 device: $text")
            result.success(true)
            return
        }

        try {
            service.printText(text, 24f, false, false, null)
            result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending text to iPos printer: ${e.message}", e)
            result.error("PRINT_ERROR", e.message, null)
        }
    }

    private fun handleOpenDrawer(result: MethodChannel.Result) {
        val service = iPosPrinterService
        if (service == null) {
            Log.d(TAG, "openDrawer simulated on non-Q80 device.")
            result.success(true)
            return
        }

        try {
            service.openCashBox(null)
            result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error opening drawer via iPos service: ${e.message}", e)
            result.error("DRAWER_ERROR", e.message, null)
        }
    }
}
