import React, { useRef, useEffect, useState } from 'react';
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTC } from 'agora-rtc-sdk-ng';
import { useStreamStore } from '@/lib/StreamStore';
import StreamViewer from './StreamViewer';

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
  const isStreamHost = store((state) => state.isStreamHost);
  const setUserRole = store((state) => state.setUserRole);
  
  const stream = getStream(streamId);
  const isHost = isStreamHost(streamId);

  const cleanup = React.useCallback(async () => {
    try {
      if (localTracksRef.current.videoTrack) {
        localTracksRef.current.videoTrack.stop();
        await localTracksRef.current.videoTrack.close();
      }
      
      if (localTracksRef.current.audioTrack) {
        localTracksRef.current.audioTrack.stop();
        await localTracksRef.current.audioTrack.close();
      }

      if (clientRef.current?.connectionState === 'CONNECTED') {
        const tracks = [localTracksRef.current.audioTrack, localTracksRef.current.videoTrack]
          .filter((track): track is ICameraVideoTrack | IMicrophoneAudioTrack => track !== null);
        
        if (tracks.length > 0) {
          await clientRef.current.unpublish(tracks);
        }
        await clientRef.current.leave();
      }

      localTracksRef.current = { videoTrack: null, audioTrack: null };
      clientRef.current = null;
      setUserRole(streamId, null);
    } catch (err) {
      console.error('Error during cleanup:', err);
    }
  }, [streamId, setUserRole]);

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

    const initializeStream = async () => {
      try {
        if (!clientRef.current) {
          const client = AgoraRTC.createClient({ 
            mode: "live", 
            codec: "vp8",
            role: isHost ? "host" : "audience"
          });
          clientRef.current = client;

          // Set up event listeners
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

        if (!isSubscribed) return;

        await clientRef.current.join(
          AGORA_APP_ID,
          streamId,
          token,
          uid
        );

        if (isHost) {
          const [audioTrack, videoTrack] = await Promise.all([
            AgoraRTC.createMicrophoneAudioTrack(),
            AgoraRTC.createCameraVideoTrack()
          ]);

          if (!isSubscribed) {
            await cleanup();
            return;
          }

          localTracksRef.current = {
            audioTrack,
            videoTrack
          };

          await clientRef.current.publish([audioTrack, videoTrack]);

          if (videoRef.current) {
            videoTrack.play(videoRef.current);
          }
        }

        setIsInitialized(true);
        setUserRole(streamId, isHost ? 'host' : 'viewer');

      } catch (err) {
        if (isSubscribed) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to start stream';
          setError(errorMessage);
        }
      }
    };

    initializeStream();

    return () => {
      isSubscribed = false;
      cleanup();
    };
  }, [stream, streamId, updateViewerCount, isHost, setUserRole]);

  if (!stream) {
    return null;
  }

  // If user is not the host, render the viewer component
  if (!isHost) {
    return (
      <StreamViewer
        stream={stream}
        onClose={onClose}
      />
    );
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
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-400">
              {stream.viewers} viewer{stream.viewers !== 1 ? 's' : ''} watching
            </div>
            {isInitialized && (
              <div className="text-sm text-green-400 flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Live
              </div>
            )}
          </div>
        </>
      )}
      
      {stream.description && (
        <p className="mt-4 text-gray-300">{stream.description}</p>
      )}
      
      <div className="mt-4 flex justify-between items-center text-sm text-gray-400">
        <div>
          {isHost ? 'Streaming as host' : 'Watching stream'} • {stream.viewers} viewer{stream.viewers !== 1 ? 's' : ''}
        </div>
        {isHost && (
          <div>Host Controls Active</div>
        )}
      </div>
      
      {isInitialized && (
        <div className="mt-4 text-sm text-gray-400">
          Streaming as host • {stream.viewers} viewer{stream.viewers !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default StreamComponent;
