// StreamContainer.tsx
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
    <div className="flex gap-4">
      <div className="w-2/3">
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
      </div>
      <div className="w-1/3">
        <ChatWindow 
          streamId={stream.id}
        />
      </div>
    </div>
  );
};

export default StreamContainer;
