import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Top-level React error boundary.
 *
 * Without one, any uncaught render/lifecycle error unwinds the whole tree and
 * leaves a blank screen with no recovery. This boundary catches those errors,
 * logs them (component stack included), and renders a pixel-theme fallback with
 * a reload action so the user is never stuck on an unrecoverable white page.
 *
 * Bootstrap wiring (`main.tsx`) wraps `<App />` with it.
 */
interface ErrorBoundaryProps {
  /** The application tree this boundary protects. */
  children: ReactNode;
}

interface ErrorBoundaryState {
  /** true once a render error has been caught. */
  hasError: boolean;
  /** The caught error message, shown so the failure is not opaque. */
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the render failure observable in the console; never swallow it.
    console.error('[OmniChat] Unhandled render error:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-dvh flex items-center justify-center bg-chill-bg px-4">
        <div className="w-full max-w-sm border-2 border-chill-border bg-chill-surface px-6 py-8 text-center rounded-none pixel-shadow">
          <h1 className="text-lg font-bold text-chill-text pixel-heading">
            Ups, terjadi kesalahan
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-chill-muted">
            Antarmuka gagal dirender. Muat ulang untuk melanjutkan percakapan.
          </p>
          {this.state.message ? (
            <p
              className="mt-4 border-l-2 border-chill-border pl-3 text-left text-xs break-words text-chill-muted"
              role="alert"
            >
              {this.state.message}
            </p>
          ) : null}
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-4 border-2 border-chill-border bg-chill-elevated text-sm font-medium text-chill-accent hover:border-chill-accent active:bg-chill-accent-hover active:translate-y-[2px] active:shadow-none transition rounded-none pixel-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
          >
            Muat ulang
          </button>
        </div>
      </div>
    );
  }
}
