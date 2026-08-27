package com.omnifood.pos_app.printer

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import woyou.aidlservice.jiu_mi.IWoyouService

/**
 * Native Android MethodChannel handler for Sunmi V2s and Sunmi OS Integrated Thermal Printers (58mm).
 * Connects to Sunmi AIDL service (woyou.aidlservice.jiu-mi) with graceful fallback for non-Sunmi devices.
 */
class SunmiPrinterHandler(private val context: Context) : MethodChannel.MethodCallHandler {
    companion object {
        private const val TAG = "OmniFoodSunmiNative"
        private const val CHANNEL_NAME = "com.omnifood.pos/sunmi_printer"
        private const val SERVICE_PACKAGE = "woyou.aidlservice.jiu-mi"
        private const val SERVICE_ACTION = "woyou.aidlservice.jiu-mi.IWoyouService"
    }

    private var channel: MethodChannel? = null
    private var woyouService: IWoyouService? = null
    private var isBound = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            woyouService = IWoyouService.Stub.asInterface(service)
            isBound = true
            Log.i(TAG, "Sunmi Printer Service connected successfully.")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            woyouService = null
            isBound = false
            Log.w(TAG, "Sunmi Printer Service disconnected.")
        }
    }

    fun register(messenger: BinaryMessenger) {
        channel = MethodChannel(messenger, CHANNEL_NAME).apply {
            setMethodCallHandler(this@SunmiPrinterHandler)
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
                Log.d(TAG, "Sunmi Printer Service not present on this device (Standard Android / Non-Sunmi). Fallback mode active.")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Exception while attempting to bind Sunmi Printer Service: ${e.message}. Fallback mode active.")
        }
    }

    private fun disconnectService() {
        if (isBound) {
            try {
                context.unbindService(serviceConnection)
                isBound = false
                woyouService = null
            } catch (e: Exception) {
                Log.w(TAG, "Exception unbinding service: ${e.message}")
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
        val service = woyouService
        if (service == null) {
            // Non-Sunmi device (e.g. Samsung S23/S24 Ultra, emulator) - return READY for simulation fallback
            Log.d(TAG, "getPrinterStatus called without active Sunmi service. Returning READY fallback.")
            result.success("READY")
            return
        }

        try {
            val status = service.printerStatus
            val statusString = when (status) {
                1 -> "READY"
                2 -> "BUSY"
                3 -> "OFFLINE"
                4 -> "OUT_OF_PAPER"
                5 -> "OVERHEATING"
                505 -> "OFFLINE"
                else -> "READY"
            }
            Log.d(TAG, "Sunmi native printer status: $status -> $statusString")
            result.success(statusString)
        } catch (e: Exception) {
            Log.e(TAG, "Error querying Sunmi printer status: ${e.message}", e)
            result.error("STATUS_ERROR", e.message, null)
        }
    }

    private fun handlePrintRawBytes(call: MethodCall, result: MethodChannel.Result) {
        val bytes = call.argument<ByteArray>("bytes")
        if (bytes == null || bytes.isEmpty()) {
            result.error("INVALID_ARGS", "Bytes array is empty or null", null)
            return
        }

        val service = woyouService
        if (service == null) {
            Log.d(TAG, "printRawBytes (${bytes.size} bytes) simulated on non-Sunmi device.")
            result.success(true)
            return
        }

        try {
            service.sendRAWData(bytes, null)
            result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending raw bytes to Sunmi printer: ${e.message}", e)
            result.error("PRINT_ERROR", e.message, null)
        }
    }

    private fun handlePrintText(call: MethodCall, result: MethodChannel.Result) {
        val text = call.argument<String>("text")
        if (text == null) {
            result.error("INVALID_ARGS", "Text argument is null", null)
            return
        }

        val service = woyouService
        if (service == null) {
            Log.d(TAG, "printText simulated on non-Sunmi device: $text")
            result.success(true)
            return
        }

        try {
            service.printOriginalText(text, null)
            result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending text to Sunmi printer: ${e.message}", e)
            result.error("PRINT_ERROR", e.message, null)
        }
    }

    private fun handleOpenDrawer(result: MethodChannel.Result) {
        val service = woyouService
        if (service == null) {
            Log.d(TAG, "openDrawer simulated on non-Sunmi device.")
            result.success(true)
            return
        }

        try {
            service.openDrawer(null)
            result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error opening drawer via Sunmi service: ${e.message}", e)
            result.error("DRAWER_ERROR", e.message, null)
        }
    }
}
