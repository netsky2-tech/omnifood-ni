package com.iposprinter.iposprinterservice;
import android.graphics.Bitmap;
import com.iposprinter.iposprinterservice.IPosPrinterCallback;

interface IPosPrinterService {
    int getPrinterStatus();
    void printerInit(in IPosPrinterCallback callback);
    void printText(String text, float fontSize, boolean isBold, boolean isUnderLine, in IPosPrinterCallback callback);
    void printSpecifiedTypeText(String text, String typeface, int fontSize, boolean isBold, boolean isUnderLine, in IPosPrinterCallback callback);
    void setPrinterPrintDepth(int depth, in IPosPrinterCallback callback);
    void setPrinterPrintFontType(String typeface, in IPosPrinterCallback callback);
    void setPrinterPrintFontSize(float fontSize, in IPosPrinterCallback callback);
    void setPrinterPrintAlignment(int alignment, in IPosPrinterCallback callback);
    void printerFeedLines(int lines, in IPosPrinterCallback callback);
    void printBitmap(in Bitmap bitmap, in IPosPrinterCallback callback);
    void printBarCode(String str, int symbology, int height, int width, int textposition, in IPosPrinterCallback callback);
    void printQRCode(String str, int modulesize, int errorlevel, in IPosPrinterCallback callback);
    void printRawData(in byte[] rawPrintData, in IPosPrinterCallback callback);
    void openCashBox(in IPosPrinterCallback callback);
    void cutPaper(in IPosPrinterCallback callback);
    void getPrinterSerialNo(in IPosPrinterCallback callback);
    void getPrinterFirmwareVersion(in IPosPrinterCallback callback);
    void getPrinterHardwareVersion(in IPosPrinterCallback callback);
    void getPrinterTableVersion(in IPosPrinterCallback callback);
    void printerSelfChecking(in IPosPrinterCallback callback);
    void setPrinterPaperWidth(int width, in IPosPrinterCallback callback);
}
