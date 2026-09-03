package com.iposprinter.iposprinterservice;

interface IPosPrinterCallback {
    void onRunResult(boolean isSuccess);
    void onReturnString(String value);
    void onRaiseException(int code, String msg);
    void onPrintResult(int code, String msg);
}
