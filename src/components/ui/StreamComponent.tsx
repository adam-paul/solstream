// src/components/ui/StreamComponent.tsx
import React, { useRef, useEffect, useState } from 'react';
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTC } from 'agora-rtc-sdk-ng';
import { useStreamStore } from '@/lib/StreamStore';

// Initialize AgoraRTC only on the client side
let AgoraRTC: IAgoraRTC;
if (typeof window !== 'undefined') {
  AgoraRTC = require('agora-rtc-sdk-ng');
}

interface StreamComponentProps {
  streamId: string;
  onClose: () => void;
}

const StreamComponent: React.FC<StreamComponentProps> = ({
  streamId,
  onClose,
}) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTracksRef = useRef<{
    videoTrack: ICameraVideoTrack | null;
    audioTrack: IMicrophoneAudioTrack | null;
  }>({ videoTrack: null, audioTrack: null });
  
  const [error, setError] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);
  
  const store = useStreamStore();
  const getStream = store((state) => state.getStream);
  const updateViewerCount = store((state) => state.updateViewerCount);
  const endStream = store((state) => state.endStream);
  const isHost = store((state) => state.isStreamHost(streamId));
  
  const stream = getStream(streamId);

  // Cleanup function
  const cleanup = async () => {
    try {
      // Clean up tracks
      if (localTracksRef.current.videoTrack) {
        localTracksRef.current.videoTrack.stop();
        await localTracksRef.current.videoTrack.close();
      }
      
      if (localTracksRef.current.audioTrack) {
        localTracksRef.current.audioTrack.stop();
        await localTracksRef.current.audioTrack.close();
      }

      // Clean up client
      if (clientRef.current) {
        // Remove all event listeners
        clientRef.current.removeAllListeners();
        
        // Unpublish and leave if connected
        if (clientRef.current.connectionState === 'CONNECTED') {
          const tracks = [localTracksRef.current.audioTrack, localTracksRef.current.videoTrack]
            .filter((track): track is ICameraVideoTrack | IMicrophoneAudioTrack => track !== null);
          
          if (tracks.length > 0) {
            await clientRef.current.unpublish(tracks);
          }
          await clientRef.current.leave();
        }
      }

      // Reset refs
      localTracksRef.current = { videoTrack: null, audioTrack: null };
      clientRef.current = null;
    } catch (err) {
      console.error('Error during cleanup:', err);
      setError('Failed to clean up stream resources');
    }
  };

  const handleEndStream = async () => {
    await cleanup();
    endStream(streamId);
    onClose();
    window.location.href = '/';
  };

  useEffect(() => {
    let isSubscribed = true;

    if (typeof window === 'undefined' || !AgoraRTC || !stream || !isHost) {
      return;
    }

    const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!AGORA_APP_ID) {
      setError('Agora App ID not configured');
      return;
    }

    const initStream = async () => {
      try {
        if (!clientRef.current) {
          const client = AgoraRTC.createClient({ 
            mode: "live", 
            codec: "vp8",
            role: "host"
          });
          clientRef.current = client;

          client.on("user-joined", () => {
            if (isSubscribed && clientRef.current) {
              updateViewerCount(streamId, clientRef.current.remoteUsers.length + 1);
            }
          });

          client.on("user-left", () => {
            if (isSubscribed && clientRef.current) {
              updateViewerCount(streamId, clientRef.current.remoteUsers.length + 1);
            }
          });
        }

        // Get token from our API
        const response = await fetch(`/api/agora-token?channel=${streamId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch token');
        }
        const { token, uid } = await response.json();
        
        if (!token) {
          throw new Error('Failed to generate token');
        }

        await clientRef.current.join(
          AGORA_APP_ID,
          streamId,
          token,
          uid
        );

        // Create and initialize tracks
        const [audioTrack, videoTrack] = await Promise.all([
          AgoraRTC.createMicrophoneAudioTrack(),
          AgoraRTC.createCameraVideoTrack()
        ]);

        if (!isSubscribed) return;

        localTracksRef.current = {
          audioTrack,
          videoTrack
        };

        // Publish tracks
        await clientRef.current.publish([audioTrack, videoTrack]);

        if (videoRef.current) {
          videoTrack.play(videoRef.current);
        }

        setIsInitialized(true);

      } catch (err) {
        if (isSubscribed) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to start stream';
          setError(errorMessage);
        }
      }
    };

    initStream();

    return () => {
      isSubscribed = false;
      cleanup();
    };
  }, [stream, streamId, updateViewerCount, isHost]);

  if (!stream || !isHost) {
    return null;
  }

  return (
    <div className="w-full bg-gray-800 rounded-lg p-4 mb-8">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-yellow-400">{stream.title}</h2>
          {stream.ticker && <p className="text-gray-400">${stream.ticker}</p>}
        </div>
        <button 
          onClick={handleEndStream}
          className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg"
        >
          End Stream
        </button>
      </div>
      
      {error ? (
        <div className="text-red-500 p-4 bg-gray-900 rounded-lg">{error}</div>
      ) : (
        <>
          <div 
            ref={videoRef} 
            className="w-full aspect-video bg-gray-900 rounded-lg"
          />
          {isInitialized && stream.viewers > 0 && (
            <div className="mt-4 text-sm text-gray-400">
              {stream.viewers} viewer{stream.viewers !== 1 ? 's' : ''} watching
            </div>
          )}
        </>
      )}
      
      {stream.description && (
        <p className="mt-4 text-gray-300">{stream.description}</p>
      )}
    </div>
  );
};

export default StreamComponent;
