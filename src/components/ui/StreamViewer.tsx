// src/components/ui/StreamViewer.tsx
'use client'

import React, { useRef, useEffect, useState } from 'react';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, ConnectionState } from 'agora-rtc-sdk-ng';
import { useInitializedStreamStore } from '@/lib/StreamStore';
import type { Stream } from '@/types/stream';

// Initialize AgoraRTC only on the client side
let AgoraRTC: any;
if (typeof window !== 'undefined') {
  AgoraRTC = require('agora-rtc-sdk-ng').default;
}

interface StreamViewerProps {
  stream: Stream;
}

const CONNECTION_TIMEOUT = 15000; // 15 seconds timeout

const StreamViewer: React.FC<StreamViewerProps> = ({ stream }) => {
  // Refs for managing Agora connection
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  
  // Local state
  const [error, setError] = useState<string>('');
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  
  // Get store methods
  const {
    isStreamHost,
    isStreamActive,
    setUserRole
  } = useInitializedStreamStore();

  // Cleanup function
  const cleanup = React.useCallback(async () => {
    console.log('[StreamViewer] Starting cleanup...');
    try {
      if (clientRef.current) {
        // Unsubscribe from all remote users
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
        
        // Leave channel if connected
        if (clientRef.current.connectionState === 'CONNECTED') {
          await clientRef.current.leave();
        }
        
        clientRef.current = null;
      }
      
      setUserRole(stream.id, null);
      console.log('[StreamViewer] Cleanup completed');
    } catch (err) {
      console.error('[StreamViewer] Cleanup error:', err);
    }
  }, [stream.id, setUserRole]);

  // Initialize viewer
  useEffect(() => {
    let isMounted = true;
    let connectionTimeout: NodeJS.Timeout;

    if (typeof window === 'undefined' || !AgoraRTC || !isStreamActive(stream.id)) {
      return;
    }

    const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!AGORA_APP_ID) {
      setError('Agora App ID not configured');
      return;
    }

    const initViewer = async () => {
      try {
        console.log('[StreamViewer] Initializing viewer...');
        
        // Set connection timeout
        connectionTimeout = setTimeout(() => {
          if (isMounted && connectionState === 'connecting') {
            setError('Connection timeout - please try again');
            setConnectionState('failed');
            cleanup();
          }
        }, CONNECTION_TIMEOUT);

        // Create and configure client
        const client = AgoraRTC.createClient({
          mode: "live",
          codec: "vp8",
          role: "audience"
        });
        
        clientRef.current = client;

        // Get token
        const response = await fetch(`/api/agora-token?channel=${stream.id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch token');
        }
        
        const { token, uid } = await response.json();
        if (!token) {
          throw new Error('Failed to generate token');
        }

        // Set up connection state handler
        client.on("connection-state-change", (curState: ConnectionState, prevState: ConnectionState) => {
          console.log("[StreamViewer] Connection state:", prevState, "->", curState);
          
          if (curState === "CONNECTED") {
            setConnectionState('connected');
            clearTimeout(connectionTimeout);
            setUserRole(stream.id, 'viewer');
          } else if (curState === "DISCONNECTED") {
            setConnectionState('failed');
            setUserRole(stream.id, null);
          }
        });

        // Set up remote user handler
        client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
          console.log('[StreamViewer] Remote user published:', { uid: user.uid, mediaType });
          
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

        // Join channel
        console.log('[StreamViewer] Joining channel:', stream.id);
        await client.join(AGORA_APP_ID, stream.id, token, uid);
        console.log('[StreamViewer] Join successful');

      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to connect to stream';
          console.error('[StreamViewer] Initialization error:', errorMessage);
          setError(errorMessage);
          setConnectionState('failed');
        }
      }
    };

    initViewer();

    return () => {
      isMounted = false;
      clearTimeout(connectionTimeout);
      cleanup();
    };
  }, [stream.id, connectionState, isStreamActive, setUserRole, cleanup]);

  // Check if user can view this stream
  if (isStreamHost(stream.id)) {
    return (
      <div className="text-red-500 p-4 bg-gray-900 rounded-lg">
        Cannot view your own stream as a viewer
      </div>
    );
  }

  // Handle retry
  const handleRetry = () => {
    setError('');
    setConnectionState('connecting');
    cleanup().then(() => {
      if (clientRef.current) {
        clientRef.current.leave();
        clientRef.current = null;
      }
    });
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
