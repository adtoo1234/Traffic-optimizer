import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in Application:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isGitHubPages =
        typeof window !== 'undefined' && window.location.hostname.includes('github.io');

      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>

            <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>

            <p className="text-sm text-slate-400 mb-4">
              The application encountered an unexpected error during initialization.
            </p>

            {isGitHubPages && (
              <div className="w-full bg-slate-800/80 rounded-xl p-3 mb-4 text-left border border-slate-700/60">
                <p className="text-xs font-semibold text-amber-300 mb-1">
                  GitHub Pages Deployment Detected:
                </p>
                <p className="text-[11px] text-slate-300 mb-2">
                  Ensure your Google Maps API key has authorized{' '}
                  <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-200">
                    {window.location.origin}/*
                  </code>{' '}
                  in Google Cloud Console credentials under HTTP referrers.
                </p>
              </div>
            )}

            {this.state.error && (
              <div className="w-full bg-slate-950/80 rounded-xl p-3 mb-5 text-left border border-slate-800 font-mono text-[11px] text-rose-300 max-h-32 overflow-y-auto">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
