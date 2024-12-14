'use client'

import React, { useRef, useEffect, useState } from 'react';
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { useStreamStore } from '@/lib/StreamStore';

// Declare AgoraRTC as a variable that will be initialized on the client side
let AgoraRTC: any;

// Initialize AgoraRTC only on the client side
if (typeof window !== 'undefined') {
  AgoraRTC = require('agora-rtc-sdk-ng');
}

interface StreamComponentProps {
  onClose: () => void;
  title: string;
  description: string;
  ticker: string;
}

const StreamComponent: React.FC<StreamComponentProps> = ({
  onClose,
  title,
  description,
  ticker,
}) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const [error, setError] = useState<string>('');
  const { addStream, removeStream, updateViewerCount } = useStreamStore();
  const [localTracks, setLocalTracks] = useState<{
    videoTrack: ICameraVideoTrack | null;
    audioTrack: IMicrophoneAudioTrack | null;
  }>({ videoTrack: null, audioTrack: null });
  const [streamId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (typeof window === 'undefined' || !AgoraRTC) {
      return;
    }

    const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!AGORA_APP_ID) {
      setError('Agora App ID not configured');
      return;
    }

    const initAgora = async () => {
      try {
        // Initialize Agora client
        const client = AgoraRTC.createClient({ 
          mode: "live", 
          codec: "vp8",
          role: "host"
        });
        clientRef.current = client;

        // Add new stream to store
        addStream({
          title,
          description,
          ticker,
          creator: 'Current User',
          marketCap: '0',
          thumbnail: "/api/placeholder/400/300"
        });

        const [audioTrack, videoTrack] = await Promise.all([
          AgoraRTC.createMicrophoneAudioTrack(),
          AgoraRTC.createCameraVideoTrack()
        ]);

        setLocalTracks({
          audioTrack,
          videoTrack
        });

        const channelName = `stream-${title.replace(/\s+/g, '-').toLowerCase()}`;
        await client.join(
          AGORA_APP_ID,
          channelName,
          null,
          null
        );

        await client.publish([audioTrack, videoTrack]);

        if (videoRef.current) {
          videoTrack.play(videoRef.current);
        }

        client.on("user-joined", () => {
          const viewerCount = client.remoteUsers.length;
          updateViewerCount(streamId, viewerCount);
        });

        client.on("user-left", () => {
          const viewerCount = client.remoteUsers.length;
          updateViewerCount(streamId, viewerCount);
        });

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to start stream';
        setError(errorMessage);
      }
    };

    initAgora();

    return () => {
      if (clientRef.current) {
        localTracks.audioTrack?.close();
        localTracks.videoTrack?.close();
        clientRef.current.unpublish().then(() => {
          clientRef.current?.leave();
        });
        removeStream(streamId);
      }
    };
  }, [title, description, ticker, addStream, removeStream, updateViewerCount, streamId]);

  const handleClose = async () => {
    if (clientRef.current) {
      localTracks.audioTrack?.close();
      localTracks.videoTrack?.close();
      await clientRef.current.unpublish();
      await clientRef.current.leave();
    }
    onClose();
  };

  return (
    <div className="w-full bg-gray-800 rounded-lg p-4 mb-8">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-yellow-400">{title}</h2>
          <p className="text-gray-400">${ticker}</p>
        </div>
        <button 
          onClick={handleClose}
          className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg"
        >
          End Stream
        </button>
      </div>
      {error ? (
        <div className="text-red-500 p-4 bg-gray-900 rounded-lg">{error}</div>
      ) : (
        <div 
          ref={videoRef} 
          className="w-full aspect-video bg-gray-900 rounded-lg"
        />
      )}
      <p className="mt-4 text-gray-300">{description}</p>
    </div>
  );
};

export default StreamComponent;