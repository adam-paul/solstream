'use client'

import React from 'react';
import { StreamErrorBoundary } from './StreamErrorBoundary';
import StreamComponent from './StreamComponent';
import StreamViewer from './StreamViewer';
import type { Stream } from '@/types/stream';

interface StreamContainerProps {
  stream: Stream;
  isHost?: boolean;
}

export const StreamContainer: React.FC<StreamContainerProps> = ({
  stream,
  isHost = false
}) => {
  const handleError = (error: Error) => {
    // Log to your error tracking service
    console.error('[StreamContainer] Stream error:', error);
  };

  return (
    <StreamErrorBoundary streamId={stream.id} onError={handleError}>
      {isHost ? (
        <StreamComponent streamId={stream.id} />
      ) : (
        <StreamViewer stream={stream} />
      )}
    </StreamErrorBoundary>
  );
}; 