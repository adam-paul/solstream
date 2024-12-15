// src/app/stream/[id]/page.tsx
'use client'

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import StreamComponent from '@/components/ui/StreamComponent';
import StreamViewer from '@/components/ui/StreamViewer';
import { useStreamStore } from '@/lib/StreamStore';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function StreamPage(props: PageProps) {
  const router = useRouter();
  const store = useStreamStore();
  const params = React.use(props.params);
  const streamId = params.id;
  
  const stream = store((state) => state.getStream(streamId));
  const isActive = store((state) => state.isStreamActive(streamId));
  const isHost = store((state) => state.isStreamHost(streamId));

  useEffect(() => {
    // If stream doesn't exist or isn't active, redirect to home
    if (!stream || !isActive) {
      router.push('/');
    }
  }, [stream, isActive, router]);

  const handleClose = () => {
    router.push('/');
  };

  if (!stream || !isActive) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header Ticker */}
      <div className="bg-yellow-400 text-black p-2 overflow-hidden">
        <div className="flex space-x-8 animate-scroll">
          <span className="whitespace-nowrap">🎥 Currently watching: {stream.title}</span>
          <span className="whitespace-nowrap">👀 {stream.viewers} viewers</span>
          {isHost && <span className="whitespace-nowrap">🎮 Broadcasting as host</span>}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-4">
        {/* Back Button */}
        <button 
          onClick={handleClose}
          className="text-blue-400 hover:text-blue-300 text-xl mb-8 w-full text-center"
        >
          [go back]
        </button>

        {/* Stream Content */}
        <div className="w-full max-w-5xl mx-auto">
          {isHost ? (
            <StreamComponent
              streamId={streamId}
              onClose={handleClose}
            />
          ) : (
            <StreamViewer 
              stream={stream}
            />
          )}
        </div>
      </div>
    </div>
  );
}
