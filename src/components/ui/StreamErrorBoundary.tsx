// src/components/ui/StreamErrorBoundary.tsx
'use client'

import React from 'react';
import { streamLifecycle } from '@/lib/streamLifecycle';

interface Props {
  streamId: string;
  children: React.ReactNode;
  onError?: (error: Error) => void;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class StreamErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[StreamErrorBoundary] Error caught:', error, errorInfo);
    this.props.onError?.(error);
  }

  handleRetry = async () => {
    try {
      // Clean up existing resources
      await streamLifecycle.cleanup(this.props.streamId);
      // Reset error state
      this.setState({ hasError: false, error: null });
      // Call onReset if provided
      this.props.onReset?.();
    } catch (error) {
      console.error('[StreamErrorBoundary] Retry failed:', error);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full bg-gray-800 rounded-lg p-4">
          <div className="text-red-500 mb-4">
            <h3 className="text-lg font-semibold mb-2">Stream Error</h3>
            <p>{this.state.error?.message || 'An unexpected error occurred'}</p>
          </div>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded text-white"
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
