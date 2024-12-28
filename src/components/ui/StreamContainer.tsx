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
    <StreamComponent streamId={stream.id} title={stream.title} />
  ) : (
    <StreamViewer streamId={stream.id} title={stream.title} />
  );
};

export default StreamContainer;
