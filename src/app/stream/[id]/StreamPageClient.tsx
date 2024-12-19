'use client'

import React from 'react';
import { useRouter } from 'next/navigation';
import StreamComponent from '@/components/ui/StreamComponent';
import StreamViewer from '@/components/ui/StreamViewer';
import StreamErrorBoundary from '@/components/ui/StreamErrorBoundary';
import { useInitializedStreamStore } from '@/lib/StreamStore';

interface StreamPageClientProps {
  streamId: string;
}

export default function StreamPageClient({ streamId }: StreamPageClientProps) {
  const router = useRouter();

  // Get necessary store methods
  const {
    getStream,
    isStreamActive,
    isStreamHost,
    isInitialized
  } = useInitializedStreamStore();

  // Get stream data
  const stream = getStream(streamId);

  // Handle navigation
  const handleClose = () => {
    router.push('/');
  };

  // Show loading state while store initializes
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-xl">Loading stream...</p>
      </div>
    );
  }

  // Redirect if stream doesn't exist or isn't active
  if (!stream || !isStreamActive(streamId)) {
    router.push('/');
    return null;
  }

  // Determine if current user is the host
  const isHost = isStreamHost(streamId);

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
          <StreamErrorBoundary onReset={() => window.location.reload()}>
            {isHost ? (
              <StreamComponent
                key={`host-${streamId}`}
                streamId={streamId}
              />
            ) : (
              <StreamViewer
                key={`viewer-${streamId}`}
                stream={stream}
              />
            )}
          </StreamErrorBoundary>
        </div>
      </div>
    </div>
  );
}
