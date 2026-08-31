package com.nhilos.pos_app.printer

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import android.graphics.BitmapFactory
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import net.nyx.printerservice.print.IPrinterService
import net.nyx.printerservice.print.PrintTextFormat

/**
 * Native Android MethodChannel handler for Alacrity Q80 (Nyx Printer Service: net.nyx.printerservice).
 * Connects to the real hardware service found on this device.
 */
class IPosPrinterHandler(private val context: Context) : MethodChannel.MethodCallHandler {
    companion object {
        private const val TAG = "NhilosPOSNyxPrinterNative"
        private const val CHANNEL_NAME = "com.nhilos.pos/ipos_printer"
        private const val SERVICE_PACKAGE = "net.nyx.printerservice"
        private const val SERVICE_ACTION = "net.nyx.printerservice.IPrinterService"
    }

    private var channel: MethodChannel? = null
    private var printerService: IPrinterService? = null
    private var isBound = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            printerService = IPrinterService.Stub.asInterface(service)
            isBound = true
            Log.i(TAG, "Nyx Printer Service (net.nyx.printerservice) connected successfully!")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            printerService = null
            isBound = false
            Log.w(TAG, "Nyx Printer Service disconnected.")
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
            if (bound) {
                Log.i(TAG, "bindService succeeded for $SERVICE_PACKAGE")
            } else {
                Log.w(TAG, "bindService returned false for $SERVICE_PACKAGE")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Exception binding Nyx Printer Service: ${e.message}", e)
        }
    }

    private fun disconnectService() {
        if (isBound) {
            try {
                context.unbindService(serviceConnection)
                isBound = false
                printerService = null
            } catch (e: Exception) {
                Log.w(TAG, "Exception unbinding Nyx service: ${e.message}")
            }
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getPrinterStatus" -> handleGetPrinterStatus(result)
            "printRawBytes" -> handlePrintRawBytes(call, result)
            "printText" -> handlePrintText(call, result)
            "printBitmap" -> handlePrintBitmap(call, result)
            "openDrawer" -> handleOpenDrawer(result)
            else -> result.notImplemented()
        }
    }

    private fun handleGetPrinterStatus(result: MethodChannel.Result) {
        val service = printerService
        if (service == null) {
            Log.w(TAG, "getPrinterStatus: service is NULL (not bound yet).")
            result.success("OFFLINE")
            return
        }

        try {
            val status = service.printerStatus
            Log.i(TAG, "Nyx raw printer status code: $status")
            val statusString = when (status) {
                0 -> "READY"
                1, 240, 241 -> "OUT_OF_PAPER"
                2, 242 -> "OVERHEATING"
                3, 243 -> "BUSY"
                else -> if (status < 0) "ERROR" else "READY"
            }
            result.success(statusString)
        } catch (e: Exception) {
            Log.e(TAG, "Error querying Nyx printer status: ${e.message}", e)
            result.error("STATUS_ERROR", e.message, null)
        }
    }

    private fun handlePrintBitmap(call: MethodCall, result: MethodChannel.Result) {
        val bytes = call.argument<ByteArray>("bytes")
        if (bytes == null || bytes.isEmpty()) {
            result.error("INVALID_ARGS", "Bytes array is empty or null", null)
            return
        }

        val service = printerService
        if (service == null) {
            Log.w(TAG, "printBitmap: service is NULL.")
            result.error("NOT_CONNECTED", "Servicio de impresora no conectado", null)
            return
        }

        try {
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            if (bitmap == null) {
                result.error("DECODE_ERROR", "No se pudo decodificar la imagen PNG", null)
                return
            }
            // type: 0 = normal bitmap printing, align: 1 = center align
            val res = service.printBitmap(bitmap, 0, 1)
            Log.i(TAG, "Nyx printBitmap result: $res")
            result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error printing bitmap on Nyx: ${e.message}", e)
            result.error("PRINT_ERROR", e.message, null)
        }
    }

    private fun handlePrintRawBytes(call: MethodCall, result: MethodChannel.Result) {
        val bytes = call.argument<ByteArray>("bytes")
        if (bytes == null || bytes.isEmpty()) {
            result.error("INVALID_ARGS", "Bytes array is empty or null", null)
            return
        }

        val service = printerService
        if (service == null) {
            Log.w(TAG, "printRawBytes: service is NULL.")
            result.error("NOT_CONNECTED", "Servicio de impresora no conectado", null)
            return
        }

        try {
            val text = String(bytes, Charsets.ISO_8859_1)
            val format = PrintTextFormat().apply {
                textSize = 24
            }
            val res = service.printText(text, format)
            // Feed sufficient paper (140px ~ 4-5 lines) so "Gracias por su compra" clears the tear-off bar
            service.paperOut(140)
            Log.i(TAG, "printRawBytes via printText result: $res")
            result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error printing raw text: ${e.message}", e)
            result.error("PRINT_ERROR", e.message, null)
        }
    }

    private fun handlePrintText(call: MethodCall, result: MethodChannel.Result) {
        val text = call.argument<String>("text")
        if (text == null) {
            result.error("INVALID_ARGS", "Text argument is null", null)
            return
        }

        val service = printerService
        if (service == null) {
            Log.w(TAG, "printText: service is NULL.")
            result.error("NOT_CONNECTED", "Servicio de impresora no conectado", null)
            return
        }

        try {
            val format = PrintTextFormat().apply {
                textSize = 24
            }
            val res = service.printText(text, format)
            // Feed sufficient paper (140px ~ 4-5 lines) so footer clears the tear-off bar
            service.paperOut(140)
            Log.i(TAG, "printText result: $res")
            result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending text to Nyx printer: ${e.message}", e)
            result.error("PRINT_ERROR", e.message, null)
        }
    }

    private fun handleOpenDrawer(result: MethodChannel.Result) {
        val service = printerService
        if (service == null) {
            Log.w(TAG, "openDrawer called without active printer service.")
            result.success(true)
            return
        }

        try {
            // Devices without external RJ11 physical drawer port should not print escape characters.
            // Acknowledge drawer trigger cleanly without printing spurious garbage characters.
            result.success(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error opening drawer: ${e.message}", e)
            result.error("DRAWER_ERROR", e.message, null)
        }
    }
}
