'use client'

import React, { useRef, useEffect, useState } from 'react';
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTC } from 'agora-rtc-sdk-ng';
import { useStreamStore } from '@/lib/StreamStore';

// Declare AgoraRTC variable
let AgoraRTC: IAgoraRTC;

// Initialize AgoraRTC only on the client side
if (typeof window !== 'undefined') {
  // Import directly since we're already checking for browser environment
  AgoraRTC = require('agora-rtc-sdk-ng');
}

interface StreamComponentProps {
  streamId: string;
  onClose: () => void;
  isHost?: boolean;
}

const StreamComponent: React.FC<StreamComponentProps> = ({
  streamId,
  onClose,
  isHost = false,
}) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTracksRef = useRef<{
    videoTrack: ICameraVideoTrack | null;
    audioTrack: IMicrophoneAudioTrack | null;
  }>({ videoTrack: null, audioTrack: null });
  const [error, setError] = useState<string>('');
  
  const store = useStreamStore();
  const getStream = store((state) => state.getStream);
  const updateViewerCount = store((state) => state.updateViewerCount);
  const endStream = store((state) => state.endStream);
  
  const stream = getStream(streamId);

  const cleanup = async () => {
    try {
      // Stop and close video track
      if (localTracksRef.current.videoTrack) {
        localTracksRef.current.videoTrack.stop();
        await localTracksRef.current.videoTrack.close();
      }
      
      // Stop and close audio track
      if (localTracksRef.current.audioTrack) {
        localTracksRef.current.audioTrack.stop();
        await localTracksRef.current.audioTrack.close();
      }

      // Clean up client if it exists and is connected
      if (clientRef.current?.connectionState === 'CONNECTED') {
        const tracks = [localTracksRef.current.audioTrack, localTracksRef.current.videoTrack]
          .filter((track): track is ICameraVideoTrack | IMicrophoneAudioTrack => track !== null);
        
        if (tracks.length > 0) {
          await clientRef.current.unpublish(tracks);
        }
        await clientRef.current.leave();
      }

      // Reset refs
      localTracksRef.current = { videoTrack: null, audioTrack: null };
      clientRef.current = null;
    } catch (err) {
      console.error('Error during cleanup:', err);
    }
  };

  const handleEndStream = async () => {
    await cleanup();
    endStream(streamId);
    onClose();
    // Add a small delay to ensure cleanup completes before refresh
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  useEffect(() => {
    let isSubscribed = true;

    if (typeof window === 'undefined' || !AgoraRTC || !stream) {
      return;
    }

    const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!AGORA_APP_ID) {
      setError('Agora App ID not configured');
      return;
    }

    const initAgora = async () => {
      try {
        // Only create a new client if one doesn't exist
        if (!clientRef.current) {
          const client = AgoraRTC.createClient({ 
            mode: "live", 
            codec: "vp8",
            role: "host"
          });
          clientRef.current = client;

          // Set up event listeners only once
          client.on("user-joined", () => {
            if (isSubscribed && clientRef.current) {
              updateViewerCount(streamId, clientRef.current.remoteUsers.length);
            }
          });

          client.on("user-left", () => {
            if (isSubscribed && clientRef.current) {
              updateViewerCount(streamId, clientRef.current.remoteUsers.length);
            }
          });
        }

        const [audioTrack, videoTrack] = await Promise.all([
          AgoraRTC.createMicrophoneAudioTrack(),
          AgoraRTC.createCameraVideoTrack()
        ]);

        if (!isSubscribed || !clientRef.current) return;

        localTracksRef.current = {
          audioTrack,
          videoTrack
        };

        // Get token from our API
        const response = await fetch(`/api/agora-token?channel=${streamId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch token');
        }
        const { token, uid } = await response.json();
        
        if (!token) {
          throw new Error('Failed to generate token');
        }

        if (!isSubscribed) return;

        await clientRef.current.join(
          AGORA_APP_ID,
          streamId,
          token,
          uid
        );

        await clientRef.current.publish([audioTrack, videoTrack]);

        if (videoRef.current) {
          videoTrack.play(videoRef.current);
        }

      } catch (err) {
        if (isSubscribed) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to start stream';
          setError(errorMessage);
        }
      }
    };

    initAgora();

    // Cleanup function
    return () => {
      isSubscribed = false;
      cleanup();
    };
  }, [stream, streamId, updateViewerCount]);

  if (!stream) {
    return null;
  }

  return (
    <div className="w-full bg-gray-800 rounded-lg p-4 mb-8">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-yellow-400">{stream.title}</h2>
          {stream.ticker && <p className="text-gray-400">${stream.ticker}</p>}
        </div>
        {isHost && (
          <button 
            onClick={handleEndStream}
            className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg"
          >
            End Stream
          </button>
        )}
      </div>
      {error ? (
        <div className="text-red-500 p-4 bg-gray-900 rounded-lg">{error}</div>
      ) : (
        <div 
          ref={videoRef} 
          className="w-full aspect-video bg-gray-900 rounded-lg"
        />
      )}
      {stream.description && (
        <p className="mt-4 text-gray-300">{stream.description}</p>
      )}
    </div>
  );
};

export default StreamComponent;
