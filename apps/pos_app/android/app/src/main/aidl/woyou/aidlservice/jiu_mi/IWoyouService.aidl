package woyou.aidlservice.jiu_mi;

import woyou.aidlservice.jiu_mi.ICallback;

/**
 * Sunmi Integrated Thermal Printer Service Interface
 */
interface IWoyouService {
    /**
     * Printer firmware update
     */
    int updateFirmware();

    /**
     * Get firmware status
     */
    int getFirmwareStatus();

    /**
     * Get service version
     */
    int getServiceVersion();

    /**
     * Set printer style
     */
    void setPrinterStyle(int key, int value);

    /**
     * Line wrap
     */
    void lineWrap(int lines, ICallback callback);

    /**
     * Send raw ESC/POS command bytes directly to thermal print head
     */
    void sendRAWData(in byte[] data, ICallback callback);

    /**
     * Set alignment: 0-left, 1-center, 2-right
     */
    void setAlignment(int alignment, ICallback callback);

    /**
     * Set font name
     */
    void setFontName(String typeface, ICallback callback);

    /**
     * Set font size
     */
    void setFontSize(float fontSize, ICallback callback);

    /**
     * Print text
     */
    void printText(String text, ICallback callback);

    /**
     * Print text with font and size
     */
    void printTextWithFont(String text, String typeface, float fontSize, ICallback callback);

    /**
     * Print column text
     */
    void printColumnsText(in String[] colsTextArr, in int[] colsWidthArr, in int[] colsAlign, ICallback callback);

    /**
     * Print bitmap
     */
    void printBitmap(in android.graphics.Bitmap bitmap, ICallback callback);

    /**
     * Print barcode
     */
    void printBarCode(String data, int symbology, int height, int width, int textposition, ICallback callback);

    /**
     * Print QR code
     */
    void printQRCode(String data, int modulesize, int errorlevel, ICallback callback);

    /**
     * Print original text
     */
    void printOriginalText(String text, ICallback callback);

    /**
     * Commit print transaction
     */
    void commitPrint(ICallback callback);

    /**
     * Enter printer buffer
     */
    void enterPrinterBuffer(boolean clean);

    /**
     * Exit printer buffer
     */
    void exitPrinterBuffer(boolean commit);

    /**
     * Tax function
     */
    void tax(in byte[] data, ICallback callback);

    /**
     * Get printer status:
     * 1: Normal / Ready
     * 2: Preparing
     * 3: Communication abnormal
     * 4: Out of paper
     * 5: Overheating
     * 505: No printer hardware detected
     */
    int getPrinterStatus();

    /**
     * Open connected cash drawer (RJ11)
     */
    void openDrawer(ICallback callback);

    /**
     * Get number of times drawer has opened
     */
    int getOpenDrawerTimes();

    /**
     * Cut paper (if cutter is present)
     */
    void cutPaper(ICallback callback);

    /**
     * Get number of cut operations
     */
    int getCutPaperTimes();
}
