'use client'

import React, { useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { agoraService } from '@/lib/agoraService';
import { useStreamStore } from '@/lib/StreamStore';
import { Mic, Video } from 'lucide-react';

interface StreamComponentProps {
  streamId: string;
  title: string;
}

const StreamComponent: React.FC<StreamComponentProps> = ({ streamId, title }) => {
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
        <h2 className="text-2xl font-bold text-yellow-400">{title}</h2>
        <button 
          onClick={handleEndStream}
          className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg"
        >
          End Stream
        </button>
      </div>

      <div className="relative w-full group">
        <div 
          ref={videoRef} 
          className="w-full aspect-video bg-gray-900 rounded-lg"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent translate-y-full transform group-hover:translate-y-0 transition-transform duration-300 flex justify-center items-center gap-4 p-4">
          <button
            onClick={() => agoraService.toggleAudio()}
            className="bg-gray-800/80 hover:bg-gray-700/80 p-2 rounded-full transition-colors"
            aria-label="Toggle audio"
          >
            <Mic size={20} className="text-white" />
          </button>
          <button
            onClick={() => agoraService.toggleVideo()} 
            className="bg-gray-800/80 hover:bg-gray-700/80 p-2 rounded-full transition-colors"
            aria-label="Toggle video"
          >
            <Video size={20} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default StreamComponent;
