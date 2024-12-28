'use client'

import React from 'react';
import StreamComponent from './StreamComponent';
import StreamViewer from './StreamViewer';
import type { Stream } from '@/types/stream';

interface StreamContainerProps {
  stream: Stream;
  isHost: boolean;
}

const StreamContainer: React.FC<StreamContainerProps> = ({
  stream,
  isHost
}) => {
  return isHost ? (
    <StreamComponent streamId={stream.id} />
  ) : (
    <StreamViewer streamId={stream.id} />
  );
};

export default StreamContainer;
