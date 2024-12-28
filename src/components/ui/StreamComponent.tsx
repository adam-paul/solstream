// src/components/ui/StreamComponent.tsx
'use client'

import React, { useRef, useEffect, useState } from 'react';
import { Mic, Video, VideoOff, MicOff } from 'lucide-react';
import { agoraService } from '@/lib/agoraService';
import { useStreamStore } from '@/lib/StreamStore';
import { socketService } from '@/lib/socketService';
import { useRouter } from 'next/navigation';

interface StreamComponentProps {
  streamId: string;
}

const StreamComponent: React.FC<StreamComponentProps> = ({ streamId }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  // Minimal state
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { getStream, endStream, setStreamLiveStatus } = useStreamStore();
  const stream = getStream(streamId);

  // Initialize stream
  useEffect(() => {
    let isMounted = true;

    const initStream = async () => {
      if (!videoRef.current || !stream) return;

      try {
        await agoraService.setupStream({
          streamId,
          role: 'host',
          container: videoRef.current
        });

        if (!isMounted) return;
        
        // Start live immediately after setup
        socketService.updateStreamLiveStatus({ streamId, isLive: true });
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to initialize stream');
        setTimeout(() => setError(null), 5000);
      }
    };

    initStream();

    return () => {
      isMounted = false;
      agoraService.cleanup().catch(console.error);
    };
  }, [stream, streamId]);

  // Simple media controls
  const toggleVideo = async () => {
    try {
      await agoraService.toggleVideo(!isVideoEnabled);
      setIsVideoEnabled(!isVideoEnabled);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to toggle video';
      setError(message);
      setTimeout(() => setError(null), 5000);
    }
  };

  const toggleAudio = async () => {
    try {
      await agoraService.toggleAudio(!isAudioEnabled);
      setIsAudioEnabled(!isAudioEnabled);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to toggle audio';
      setError(message);
      setTimeout(() => setError(null), 5000);
    }
  };

  // End stream
  const handleEndStream = async () => {
    try {
      if (stream?.isLive) {
        setStreamLiveStatus(streamId, false);
        socketService.updateStreamLiveStatus({ streamId, isLive: false });
      }
      
      await agoraService.cleanup();
      endStream(streamId);
      router.push('/');
    } catch (error) {
      console.error('Error ending stream:', error);
      router.push('/');
    }
  };

  if (!stream) return null;

  return (
    <div className="w-full bg-gray-800 rounded-lg p-4 mb-8">
      {/* Stream Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-yellow-400">
            {stream.isLive ? 'Live: ' : 'Preview: '}{stream.title}
          </h2>
          {stream.ticker && <p className="text-gray-400">${stream.ticker}</p>}
        </div>
        
        <button 
          onClick={handleEndStream}
          className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg"
        >
          End Stream
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="text-red-500 p-4 bg-gray-900 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Video Container */}
      <div className="relative">
        <div 
          ref={videoRef}
          className="w-full aspect-video bg-gray-900 rounded-lg"
        />

        {/* Stream Controls */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-4">
          <button
            onClick={toggleVideo}
            className={`p-2 rounded-full ${
              isVideoEnabled ? 'bg-blue-500' : 'bg-red-500'
            }`}
          >
            {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          <button
            onClick={toggleAudio}
            className={`p-2 rounded-full ${
              isAudioEnabled ? 'bg-blue-500' : 'bg-red-500'
            }`}
          >
            {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
        </div>
      </div>

      {/* Viewer Count */}
      {stream.isLive && stream.viewers > 0 && (
        <div className="mt-4 text-sm text-gray-400">
          {stream.viewers} viewer{stream.viewers !== 1 ? 's' : ''} watching
        </div>
      )}

      {/* Stream Description */}
      {stream.description && (
        <p className="mt-4 text-gray-300">{stream.description}</p>
      )}
    </div>
  );
};

export default StreamComponent;
