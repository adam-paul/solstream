// src/components/ui/StreamErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class StreamErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Stream error caught:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full min-h-[200px] bg-gray-800 rounded-lg p-6 text-center">
          <h3 className="text-xl text-red-500 mb-4">Stream Error</h3>
          <p className="text-gray-300 mb-4">
            {this.state.error?.message || 'An unexpected error occurred while displaying the stream.'}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default StreamErrorBoundary;
