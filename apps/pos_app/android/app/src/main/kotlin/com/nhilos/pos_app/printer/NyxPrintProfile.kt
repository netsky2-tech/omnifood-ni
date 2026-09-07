package com.nhilos.pos_app.printer

import net.nyx.printerservice.print.PrintTextFormat

/** Physical rendering parameters owned by the Nyx adapter, never by receipt layout. */
internal data class NyxPrintProfile(
    val font: Int,
    val textSize: Int,
    val textScaleX: Float,
    val textScaleY: Float,
    val letterSpacing: Float,
    val printableWidthDots: Int,
    val leftPaddingDots: Int,
) {
    fun createFormat(leftPaddingDots: Int = this.leftPaddingDots) = PrintTextFormat().apply {
        font = this@NyxPrintProfile.font
        textSize = this@NyxPrintProfile.textSize
        textScaleX = this@NyxPrintProfile.textScaleX
        textScaleY = this@NyxPrintProfile.textScaleY
        letterSpacing = this@NyxPrintProfile.letterSpacing
        leftPadding = leftPaddingDots
    }

    companion object {
        val receipt80mm = NyxPrintProfile(
            font = 4,
            textSize = 24,
            textScaleX = 1.0f,
            textScaleY = 1.0f,
            letterSpacing = 0.0f,
            printableWidthDots = 576,
            leftPaddingDots = 8,
        )
    }
}
