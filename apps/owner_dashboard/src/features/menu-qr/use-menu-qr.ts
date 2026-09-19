import { useCallback, useState } from "react";
import { generateMenuQrDataUrl, validateMenuUrl } from "./qr-encode";
import type { MenuQrImage, MenuUrlErrorCode } from "./types";

/**
 * localStorage key for the last successfully generated canonical menu URL.
 * The value is always a previously validated canonical URL, and it is
 * re-validated on read so stale or tampered data never reaches the form.
 */
export const MENU_QR_STORAGE_KEY = "owner-dashboard:menu-qr:last-url";

/** Stable download filename for the generated QR PNG. */
export const MENU_QR_DOWNLOAD_FILENAME = "codigo-qr-menu.png";

/**
 * Spanish copy for each validation error code from the T1 contract. The page
 * maps codes to user-facing language here instead of leaking the English
 * contract messages from `validateMenuUrl`.
 */
const SPANISH_VALIDATION_MESSAGES: Record<MenuUrlErrorCode, string> = {
  empty: "Ingresá la URL del menú.",
  invalid_url: "Ingresá una URL completa, incluido el dominio.",
  unsupported_scheme: "Solo se admiten enlaces http: o https:.",
  credentials: "El enlace no puede incluir usuario ni contraseña.",
  oversized: "La URL es demasiado larga para un código QR escaneable.",
};

const GENERATION_ERROR_MESSAGE =
  "No se pudo generar el código QR. Intentá nuevamente.";
const DOWNLOAD_ERROR_MESSAGE =
  "No se pudo descargar el archivo. Intentá nuevamente.";
const SUCCESS_MESSAGE = "Código QR generado correctamente.";

/**
 * Read the last generated canonical URL from localStorage.
 *
 * Every failure path (unavailable storage, invalid stored value) degrades to
 * an empty form instead of breaking the page: persistence is a convenience,
 * never a requirement for generating or downloading the QR.
 */
function readStoredUrl(): string {
  try {
    const stored = window.localStorage.getItem(MENU_QR_STORAGE_KEY);
    if (stored === null) {
      return "";
    }
    const validation = validateMenuUrl(stored);
    return validation.ok ? validation.url : "";
  } catch {
    return "";
  }
}

/**
 * Persist the last generated canonical URL. Storage failures are swallowed:
 * a full or blocked localStorage must not turn a successful generation into
 * an error for the user.
 */
function storeUrl(url: string): void {
  try {
    window.localStorage.setItem(MENU_QR_STORAGE_KEY, url);
  } catch {
    // Intentionally ignored: persistence is best-effort.
  }
}

export interface UseMenuQrResult {
  /** Current input value, as typed by the user. */
  url: string;
  setUrl: (value: string) => void;
  /** Last successfully generated QR image, or null. */
  qrImage: MenuQrImage | null;
  /** Inline validation message (Spanish) for the current input, or null. */
  validationError: string | null;
  /** Operation-level error (generation/download) for the alert region, or null. */
  actionError: string | null;
  /** Success announcement for the polite live region, or null. */
  statusMessage: string | null;
  /** Validate and generate the QR for the current input. */
  generate: () => void;
  /** Download the generated PNG with a stable filename. */
  download: () => void;
}

/**
 * State machine for the menu QR workflow: URL input -> validation -> offline
 * PNG generation -> download, with best-effort localStorage persistence.
 *
 * Generation and download are fully synchronous, bundled, and network-free:
 * the encoder (uqr) and the PNG rasterizer live in the bundle, so the flow
 * keeps working with no connectivity and produces CSP-safe `data:` URLs.
 */
export function useMenuQr(): UseMenuQrResult {
  const [url, setUrlState] = useState(readStoredUrl);
  const [qrImage, setQrImage] = useState<MenuQrImage | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const setUrlValue = useCallback((value: string) => {
    setUrlState(value);
    // Any edit after a generation invalidates the previous result: the stale
    // preview and success status must never describe a URL the user no longer
    // sees in the input. Validation and action errors stay until the next
    // generate attempt resolves them.
    setQrImage(null);
    setStatusMessage(null);
  }, []);

  const generate = useCallback(() => {
    const validation = validateMenuUrl(url);
    if (!validation.ok) {
      setValidationError(SPANISH_VALIDATION_MESSAGES[validation.code]);
      setActionError(null);
      setStatusMessage(null);
      setQrImage(null);
      return;
    }

    try {
      // The encoder validates and canonicalizes again; the image carries the
      // canonical payload URL that is encoded into the QR.
      const image = generateMenuQrDataUrl(url);
      setQrImage(image);
      setValidationError(null);
      setActionError(null);
      setStatusMessage(SUCCESS_MESSAGE);
      storeUrl(image.payloadUrl);
    } catch {
      setQrImage(null);
      setStatusMessage(null);
      setValidationError(null);
      setActionError(GENERATION_ERROR_MESSAGE);
    }
  }, [url]);

  const download = useCallback(() => {
    if (!qrImage) {
      return;
    }
    try {
      // A data-url anchor download keeps the flow network-free and CSP-safe:
      // no blob URL and no fetch is involved.
      const anchor = document.createElement("a");
      anchor.href = qrImage.dataUrl;
      anchor.download = MENU_QR_DOWNLOAD_FILENAME;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setStatusMessage(null);
      setActionError(DOWNLOAD_ERROR_MESSAGE);
    }
  }, [qrImage]);

  return {
    url,
    setUrl: setUrlValue,
    qrImage,
    validationError,
    actionError,
    statusMessage,
    generate,
    download,
  };
}
