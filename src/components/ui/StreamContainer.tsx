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
    <div className="flex flex-col md:flex-row gap-5 md:h-[calc(100vh-16rem)]">
      <div className="w-full md:w-2/3">
        {isHost ? (
          <StreamComponent 
            streamId={stream.id} 
            title={stream.title} 
            ticker={stream.ticker}
            coinAddress={stream.coinAddress}
            isLive={stream.isLive} 
          />
        ) : (
          <StreamViewer 
            streamId={stream.id} 
            title={stream.title} 
            ticker={stream.ticker}
          />
        )}
      </div>
      <div className="w-full md:w-1/3 h-[300px] md:h-full">
        <ChatWindow 
          streamId={stream.id}
        />
      </div>
    </div>
  );
};

export default StreamContainer;