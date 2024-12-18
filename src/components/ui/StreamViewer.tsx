// src/components/ui/StreamViewer.tsx
import React, { useEffect, useRef, useState } from 'react';
import type { IAgoraRTCClient, IAgoraRTC } from 'agora-rtc-sdk-ng';
import type { Stream } from '@/types/stream';
import { useStreamStore } from '@/lib/StreamStore';

// Initialize AgoraRTC only on the client side
let AgoraRTC: IAgoraRTC;
if (typeof window !== 'undefined') {
  try {
    const AgoraRTCModule = require('agora-rtc-sdk-ng');
    console.log('[StreamViewer] AgoraRTC import result:', AgoraRTCModule);
    AgoraRTC = AgoraRTCModule.default || AgoraRTCModule;
    console.log('[StreamViewer] AgoraRTC initialized:', !!AgoraRTC);
  } catch (err) {
    console.error('[StreamViewer] Failed to import AgoraRTC:', err);
  }
}

interface StreamViewerProps {
  stream: Stream;
}

const CONNECTION_TIMEOUT = 15000; // 15 seconds timeout

const StreamViewer: React.FC<StreamViewerProps> = ({ stream }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const connectionStateRef = useRef<'connecting' | 'connected' | 'failed'>('connecting');
  const [error, setError] = useState<string>('');
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  
  // Update ref whenever state changes
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);
  
  const store = useStreamStore();
  const isStreamHost = store((state) => state.isStreamHost(stream.id));

  useEffect(() => {
    if (isStreamHost) {
      setError('Cannot view your own stream as a viewer');
      return;
    }

    if (typeof window === 'undefined') {
      console.log('[StreamViewer] Running on server side, skipping');
      return;
    }

    if (!AgoraRTC) {
      console.error('[StreamViewer] AgoraRTC not initialized');
      setError('Failed to initialize video SDK');
      return;
    }

    let isSubscribed = true;
    let connectionTimeout: NodeJS.Timeout;

    const initViewer = async () => {
      try {
        console.log('[StreamViewer] Creating client object...');
        const client = AgoraRTC.createClient({
          mode: "live",
          codec: "vp8",
          role: "audience"
        });
        console.log('[StreamViewer] Client created:', !!client);

        // Set up connection timeout
        connectionTimeout = setTimeout(() => {
          if (connectionStateRef.current === 'connecting') {
            setError('Connection timeout - please try again');
            setConnectionState('failed');
            cleanup();
          }
        }, CONNECTION_TIMEOUT);

        console.log('[StreamViewer] Fetching token...');
        const response = await fetch(`/api/agora-token/?channel=${stream.id}`);
        console.log('[StreamViewer] Token response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Token fetch failed: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[StreamViewer] Token data received:', {
          hasToken: !!data.token,
          hasAppId: !!data.appId,
          hasUid: !!data.uid
        });

        if (!data.token || !data.appId) {
          throw new Error('Missing token or appId');
        }

        // Set up handlers before joining
        if (isSubscribed) {  // Only set up handlers if still mounted
          client.on("connection-state-change", (curState, prevState) => {
            console.log("[StreamViewer] Connection state:", prevState, "->", curState);
            
            if (curState === "CONNECTED") {
              setConnectionState('connected');
              clearTimeout(connectionTimeout);
            } else if (curState === "DISCONNECTED") {
              setConnectionState('failed');
            } else {
              setConnectionState('connecting');
            }
          });

          client.on("user-published", async (user, mediaType) => {
            console.log('[StreamViewer] User published:', { uid: user.uid, mediaType });
            
            try {
              await client.subscribe(user, mediaType);
              console.log('[StreamViewer] Subscribed to:', mediaType);

              if (mediaType === "video" && videoRef.current) {
                user.videoTrack?.play(videoRef.current);
                console.log('[StreamViewer] Playing video');
              }
              if (mediaType === "audio") {
                user.audioTrack?.play();
                console.log('[StreamViewer] Playing audio');
              }
            } catch (err) {
              console.error('[StreamViewer] Subscribe error:', err);
              setError('Failed to subscribe to stream');
            }
          });
        }

        console.log('[StreamViewer] Joining channel:', {
          appId: data.appId.slice(0, 4) + '...',
          channel: stream.id,
          uid: data.uid
        });

        clientRef.current = client;
        await client.join(data.appId, stream.id, data.token, data.uid);
        console.log('[StreamViewer] Join successful');
        
      } catch (err) {
        console.error('[StreamViewer] Connection error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to connect to stream';
        setError(errorMessage);
        setConnectionState('failed');
      }
    };

    const cleanup = async () => {
      clearTimeout(connectionTimeout);
      if (clientRef.current) {
        try {
          // Unsubscribe from all remote users first
          clientRef.current.remoteUsers.forEach((user) => {
            if (user.hasVideo) {
              user.videoTrack?.stop();
            }
            if (user.hasAudio) {
              user.audioTrack?.stop();
            }
          });
          
          // Remove all event listeners
          clientRef.current.removeAllListeners();
          
          // Leave the channel if connected
          if (clientRef.current.connectionState === 'CONNECTED') {
            await clientRef.current.leave();
          }
          
          clientRef.current = null;
        } catch (err) {
          console.error('[StreamViewer] Cleanup error:', err);
        }
      }
    };

    // Start connection
    console.log('[StreamViewer] Starting viewer initialization');
    initViewer();

    // Cleanup
    return () => {
      console.log('[StreamViewer] Component cleanup');
      isSubscribed = false;
      cleanup();
    };
  }, [stream.id, isStreamHost]);

  // Retry mechanism
  const handleRetry = () => {
    setError('');
    setConnectionState('connecting');
    // Re-trigger the effect
    const effect = async () => {
      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current = null;
      }
    };
    effect();
  };

  return (
    <div className="w-full bg-gray-800 rounded-lg overflow-hidden">
      {error ? (
        <div className="text-red-500 p-4 bg-gray-900 rounded-lg">
          <p className="mb-4">{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
          >
            Try Again
          </button>
        </div>
      ) : (
        <div>
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold">{stream.title}</h2>
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>{stream.creator}</span>
              <span>{connectionState === 'connected' ? 'Connected' : 'Connecting...'}</span>
            </div>
          </div>

          <div
            ref={videoRef}
            className="w-full aspect-video bg-gray-900"
          />

          {stream.description && (
            <div className="p-4 border-t border-gray-700">
              <p className="text-gray-300">{stream.description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StreamViewer;
