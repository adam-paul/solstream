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
    <div className="flex flex-col md:flex-row md:items-start md:gap-6 w-full">
      <div className="md:flex-[2]">
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
      <div className="mt-4 md:mt-0 md:flex-1">
        <ChatWindow 
          streamId={stream.id}
        />
      </div>
    </div>
  );
};

export default StreamContainer;
