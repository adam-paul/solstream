// src/app/stream/[id]/page.tsx
'use client'

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StreamComponent from '@/components/ui/StreamComponent';
import StreamViewer from '@/components/ui/StreamViewer';
import StreamErrorBoundary from '@/components/ui/StreamErrorBoundary';
import { useStreamStore } from '@/lib/StreamStore';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function StreamPage(props: PageProps) {
  const router = useRouter();
  const [streamId, setStreamId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const store = useStreamStore();
  const stream = store((state) => streamId ? state.getStream(streamId) : undefined);
  const isActive = store((state) => streamId ? state.isStreamActive(streamId) : false);
  const isHost = store((state) => streamId ? state.isStreamHost(streamId) : false);

  useEffect(() => {
    const initializeParams = async () => {
      try {
        const resolvedParams = await props.params;
        setStreamId(resolvedParams.id);
      } catch (error) {
        console.error('Error resolving params:', error);
        router.push('/');
      }
    };

    initializeParams();
  }, [props.params, router]);

  useEffect(() => {
    if (streamId && (!stream || !isActive)) {
      router.push('/');
      return;
    }
    setIsLoading(false);
  }, [stream, isActive, router, streamId]);

  const handleClose = () => {
    router.push('/');
  };

  if (isLoading || !stream || !streamId || !isActive) return null;

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

        {/* Stream Content - Key component to prevent multiple instances */}
        <div className="w-full max-w-5xl mx-auto">
          <StreamErrorBoundary onReset={() => window.location.reload()}>
            {isHost ? (
              <StreamComponent
                key={`host-${streamId}`}
                streamId={streamId}
                onClose={handleClose}
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
