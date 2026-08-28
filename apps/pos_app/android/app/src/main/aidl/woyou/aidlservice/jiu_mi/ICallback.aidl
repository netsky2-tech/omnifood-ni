package woyou.aidlservice.jiu_mi;

/**
 * Sunmi Printer Service Callback Interface
 */
interface ICallback {
    /**
     * Return result of execution
     * @param isSuccess execution result
     */
    oneway void onRunResult(boolean isSuccess);

    /**
     * Return string result of execution
     * @param result string result
     */
    oneway void onReturnString(String result);

    /**
     * Return exception code and message
     * @param code exception code
     * @param msg exception message
     */
    oneway void onRaiseException(int code, String msg);

    /**
     * Return print result code and message
     * @param code print result code
     * @param msg print message
     */
    oneway void onPrintResult(int code, String msg);
}
