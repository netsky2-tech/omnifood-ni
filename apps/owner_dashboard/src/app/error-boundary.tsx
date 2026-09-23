import { Component, type ReactNode } from "react";
import { isApiError } from "@/lib/api";
import { isChunkLoadError, triggerSafeChunkReload } from "@/lib/chunk-reload";
import { getApiErrorMessage } from "@/lib/api-error";

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Navigation identity (e.g. location.pathname). The boundary is mounted
   * once in the layout route, so it must clear its own error state when the
   * user navigates; otherwise the fallback keeps replacing <Outlet /> on
   * every route change. When absent, the error state persists until the
   * user clicks "Reintentar" (previous behaviour).
   */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Class component required by React error boundary API.
 * Wrapped as default export to avoid Vite Fast Refresh incompatibility
 * with mixed class/function exports in router.tsx.
 */
class ErrorBoundaryInner extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Preserve technical log for debugging without polluting user UI
    console.error("[ErrorBoundary caught]:", error, info);
    if (isChunkLoadError(error)) {
      triggerSafeChunkReload();
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      // Navigation identity changed: the boundary lives once in the layout
      // route, so it must clear itself instead of keeping the fallback
      // mounted across sibling navigation.
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      const requestId = isApiError(this.state.error) ? this.state.error.requestId : null;
      const isChunkError = isChunkLoadError(this.state.error);

      return (
        <div className="flex min-h-[360px] w-full items-center justify-center p-6" role="alert">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-foreground mb-1">
              Error al cargar esta sección
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-3">
              {isChunkError
                ? "Se detectó una actualización en el sistema o una interrupción temporal de descarga. Si la página no se recarga automáticamente, use el botón a continuación."
                : isApiError(this.state.error) && this.state.error.message
                  ? this.state.error.message
                  : getApiErrorMessage(this.state.error, "Ocurrió un error inesperado al procesar la vista.")}
            </p>
            {requestId && (
              <p className="text-[11px] font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1 mb-4 inline-block">
                ID de Seguimiento: {requestId}
              </p>
            )}
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                }}
                className="h-9 rounded-md border border-border bg-background px-4 text-xs sm:text-sm font-medium text-foreground hover:bg-muted cursor-pointer transition-colors"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="h-9 rounded-md bg-primary px-4 text-xs sm:text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer transition-colors shadow-xs"
              >
                Recargar página
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ErrorBoundaryInner {...props} />;
}
