// src/components/ui/StreamContainer.tsx
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
    <div className="flex flex-col md:flex-row md:gap-4">
      <div className="flex-1">
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
      <div className="mt-4 md:mt-0 md:w-[400px]">
        <ChatWindow 
          streamId={stream.id}
        />
      </div>
    </div>
  );
};

export default StreamContainer;
