'use client'

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import StreamComponent from '@/components/ui/StreamComponent';
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

  // Mock activity data (consider moving this to a shared constant)
  const mockActivity = [
    "🎥 NewStream launched for $SOL",
    "👀 Trading101 just hit 1000 viewers",
    "🚀 Technical Analysis stream starting for $BONK"
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header Ticker */}
      <div className="bg-yellow-400 text-black p-2 overflow-hidden">
        <div className="flex space-x-8 animate-scroll">
          {mockActivity.map((activity, index) => (
            <span key={index} className="whitespace-nowrap">{activity}</span>
          ))}
        </div>
      </div>

      {/* Back Button */}
      <div className="max-w-7xl mx-auto p-4">
        <button 
          onClick={handleClose}
          className="text-blue-400 hover:text-blue-300 text-xl mb-8 w-full text-center"
        >
          [go back]
        </button>

        {/* Stream Content */}
        <div className="w-full max-w-5xl mx-auto">
          {stream && (
            <StreamComponent
              streamId={streamId}
              onClose={handleClose}
              isHost={true} // This will be determined by auth in the future
            />
          )}
        </div>
      </div>
    </div>
  );
}