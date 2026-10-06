import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public handleReload = () => {
    window.location.reload();
  };

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#FAF6EE] flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-gray-100 shadow-xl text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                Něco se pokazilo
              </h2>
              <p className="text-sm text-gray-500 font-medium leading-relaxed">
                Při načítání stránky došlo k neočekávané chybě. Obnovení stránky obvykle problém vyřeší.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-red-50 rounded-xl text-left border border-red-100 overflow-x-auto text-[11px] font-mono text-red-700 max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="outline"
                onClick={this.handleReset}
                className="flex-1 rounded-xl font-bold h-11 text-xs cursor-pointer border-gray-200"
              >
                Zkusit znovu
              </Button>
              <Button
                onClick={this.handleReload}
                className="flex-1 rounded-xl bg-[#1E1B18] hover:bg-black text-white font-bold h-11 text-xs gap-2 cursor-pointer shadow-md"
              >
                <RefreshCcw size={14} />
                Obnovit stránku
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
