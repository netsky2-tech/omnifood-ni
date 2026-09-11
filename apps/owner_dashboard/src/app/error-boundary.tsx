import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
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

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-primary-50 p-8">
          <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-lg text-center">
            <h1 className="text-xl font-bold text-destructive mb-2">
              Algo salió mal
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message || "Error inesperado"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="h-10 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary-400"
            >
              Recargar página
            </button>
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
