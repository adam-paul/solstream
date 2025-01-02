'use client'

import React from 'react';
import StreamComponent from './StreamComponent';
import StreamViewer from './StreamViewer';
import { ChatWindow } from './ChatWindow';
import type { Stream } from '@/types/stream';

interface StreamContainerProps {
  stream: Stream;
  isHost: boolean;
}

const StreamContainer: React.FC<StreamContainerProps> = ({
  stream,
  isHost
}) => {
  return (
    <div className="flex flex-col space-y-4">
      {isHost ? (
        <StreamComponent 
          streamId={stream.id} 
          title={stream.title} 
          isLive={stream.isLive} 
        />
      ) : (
        <StreamViewer 
          streamId={stream.id} 
          title={stream.title} 
        />
      )}
      <ChatWindow 
        streamId={stream.id}
      />
    </div>
  );
};

export default StreamContainer;
