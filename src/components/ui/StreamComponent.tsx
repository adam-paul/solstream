'use client'

import React, { useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { agoraService } from '@/lib/agoraService';
import { useStreamStore } from '@/lib/StreamStore';

interface StreamComponentProps {
  streamId: string;
}

const StreamComponent: React.FC<StreamComponentProps> = ({ streamId }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Start stream when component mounts
  useEffect(() => {
    if (!videoRef.current) return;

    const startStream = async () => {
      try {
        await agoraService.startBroadcast(streamId, videoRef.current!);
      } catch (err) {
        console.error('Failed to start stream:', err);
      }
    };

    startStream();

    // Stop stream when component unmounts
    return () => {
      agoraService.stopBroadcast();
    };
  }, [streamId]);

  const handleEndStream = () => {
    agoraService.stopBroadcast();
    useStreamStore.getState().endStream(streamId);
    router.push('/');
  };

  return (
    <div className="w-full bg-gray-800 rounded-lg p-4 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-yellow-400">Live Stream</h2>
        <button 
          onClick={handleEndStream}
          className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg"
        >
          End Stream
        </button>
      </div>

      <div 
        ref={videoRef} 
        className="w-full aspect-video bg-gray-900 rounded-lg"
      />
    </div>
  );
};

export default StreamComponent;
