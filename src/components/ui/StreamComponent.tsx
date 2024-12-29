'use client'

import React, { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { agoraService } from '@/lib/agoraService';
import { useStreamStore } from '@/lib/StreamStore';
import { Mic, Video, MicOff, VideoOff } from 'lucide-react';

interface StreamComponentProps {
  streamId: string;
  title: string;
}

const StreamComponent: React.FC<StreamComponentProps> = ({ streamId, title }) => {
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // States
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(false);

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

      <div className="relative w-full group overflow-hidden">
        <div 
          ref={videoRef} 
          className="w-full aspect-video bg-gray-900 rounded-lg"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent translate-y-full transform group-hover:translate-y-0 transition-transform duration-300 flex justify-center items-center gap-4 p-4">
          <button
            onClick={async () => {
              const isMuted = await agoraService.toggleAudio();
              setIsAudioMuted(isMuted ?? isAudioMuted);
            }}
            className="bg-gray-800/80 hover:bg-gray-700/80 p-2 rounded-full transition-colors"
            aria-label="Toggle audio"
          >
            {isAudioMuted ? (
              <MicOff size={20} className="text-white" />
            ) : (
              <Mic size={20} className="text-white" />
            )}
          </button>
          <button
            onClick={async () => {
              const isMuted = await agoraService.toggleVideo();
              setIsVideoMuted(isMuted ?? isVideoMuted);
            }}
            className="bg-gray-800/80 hover:bg-gray-700/80 p-2 rounded-full transition-colors"
            aria-label="Toggle video"
          >
            {isVideoMuted ? (
              <VideoOff size={20} className="text-white" />
            ) : (
              <Video size={20} className="text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StreamComponent;
