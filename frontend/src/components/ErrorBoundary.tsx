/**
 * React Error Boundary — catches unexpected render-phase errors.
 *
 * Wrap the entire app (or individual route sections) with this component
 * to prevent a single component crash from taking down the whole page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 * Per the engineering standard:
 *   "Graceful error UI — no silent failures — centralised error boundary"
 */

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  /** Content to render when no error is present. */
  children:   ReactNode;
  /** Optional custom fallback UI. Defaults to a full-page error card. */
  fallback?:  ReactNode;
}

interface State {
  hasError:    boolean;
  errorMessage:string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  /**
   * Derive state from a caught render error.
   *
   * Args:    error — the JavaScript error thrown during rendering.
   * Returns: Partial state that triggers the fallback UI.
   */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  /**
   * Log error details for diagnostics.
   *
   * Args:
   *   error     — the JavaScript error.
   *   errorInfo — React component stack trace.
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // In production, replace console.error with a proper logging service call
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-mars-blue-pale px-4">
        <div className="bg-white rounded-xl shadow-lg border border-red-200 p-8 max-w-lg w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-2xl font-black">!</span>
          </div>
          <h2 className="text-xl font-black text-mars-navy mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-1">An unexpected error occurred in the dashboard.</p>
          {this.state.errorMessage && (
            <p className="text-xs text-red-400 bg-red-50 rounded px-3 py-2 mt-2 font-mono text-left break-all">
              {this.state.errorMessage}
            </p>
          )}
          <button
            onClick={this.handleReset}
            className="mt-6 px-5 py-2 bg-mars-navy text-white text-sm font-bold rounded hover:bg-mars-blue transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
