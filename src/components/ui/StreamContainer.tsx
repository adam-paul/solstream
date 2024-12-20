'use client'

import React from 'react';
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
  return isHost ? (
    <StreamComponent streamId={stream.id} />
  ) : (
    <StreamViewer stream={stream} />
  );
};

export default StreamContainer;
