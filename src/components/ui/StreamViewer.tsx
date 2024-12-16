// src/components/ui/StreamViewer.tsx
import React, { useEffect, useRef, useState } from 'react';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IAgoraRTC, ConnectionState } from 'agora-rtc-sdk-ng';
import type { Stream } from '@/lib/StreamStore';
import { useStreamStore } from '@/lib/StreamStore';
import { socketService } from '@/lib/socketService';

// Initialize AgoraRTC only on the client side
let AgoraRTC: IAgoraRTC;
if (typeof window !== 'undefined') {
  AgoraRTC = require('agora-rtc-sdk-ng');
}

interface StreamViewerProps {
  stream: Stream;
}

const StreamViewer: React.FC<StreamViewerProps> = ({ stream }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const [error, setError] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  
  const store = useStreamStore();
  const updateViewerCount = store((state) => state.updateViewerCount);
  const isStreamHost = store((state) => state.isStreamHost(stream.id));

  useEffect(() => {
    if (isStreamHost) {
      setError('Cannot view your own stream as a viewer');
      return;
    }

    if (typeof window === 'undefined' || !AgoraRTC) {
      return;
    }

    const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!AGORA_APP_ID) {
      setError('Agora App ID not configured');
      return;
    }

    let isSubscribed = true;

    const cleanup = async () => {
      if (clientRef.current) {
        // Unsubscribe from all remote users
        for (const user of clientRef.current.remoteUsers) {
          await clientRef.current.unsubscribe(user);
          if (user.videoTrack) user.videoTrack.stop();
          if (user.audioTrack) user.audioTrack.stop();
        }
        
        // Remove all event listeners
        clientRef.current.removeAllListeners();
        
        // Leave the channel
        try {
          await clientRef.current.leave();
        } catch (err) {
          console.error('Error leaving channel:', err);
        }
        
        clientRef.current = null;
        setIsConnected(false);
      }
    };

    const initViewer = async () => {
      try {
        // Clear any existing client
        if (clientRef.current) {
          await cleanup();
        }

        socketService.joinStream(stream.id);

        const client = AgoraRTC.createClient({ 
          mode: "live", 
          codec: "vp8",
          role: "audience"
        });
        clientRef.current = client;

        // Add connection state change listener
        client.on("connection-state-change", (curState: ConnectionState, prevState: ConnectionState) => {
          console.log("Connection state changed:", prevState, "->", curState);
          switch (curState) {
            case "CONNECTED":
              setConnectionState('connected');
              break;
            case "DISCONNECTED":
              setConnectionState('failed');
              break;
            default:
              setConnectionState('connecting');
          }
        });

        // Get token from our API
        const response = await fetch(`/api/agora-token?channel=${stream.id}`);
        const { token, uid } = await response.json();
        
        if (!token) {
          throw new Error('Failed to generate token');
        }

        await client.join(
          AGORA_APP_ID,
          stream.id,
          token,
          uid
        );

        client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType: "video" | "audio") => {
          if (!isSubscribed) return;
          
          await client.subscribe(user, mediaType);
          
          if (mediaType === "video" && videoRef.current) {
            user.videoTrack?.play(videoRef.current);
          }
          if (mediaType === "audio") {
            user.audioTrack?.play();
          }
        });

        // Update viewer count
        const updateCount = () => {
          if (isSubscribed && clientRef.current) {
            updateViewerCount(stream.id, clientRef.current.remoteUsers.length + 1);
          }
        };

        client.on("user-joined", updateCount);
        client.on("user-left", updateCount);
        client.on("user-published", updateCount);
        client.on("user-unpublished", updateCount);

        setIsConnected(true);
        updateCount();

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to connect to stream';
        setError(errorMessage);
      }
    };

    initViewer();

    // Add reconnection logic
    let reconnectTimer: NodeJS.Timeout;

    if (connectionState === 'failed') {
      reconnectTimer = setTimeout(() => {
        console.log('Attempting to reconnect...');
        initViewer();
      }, 5000);
    }

    return () => {
      isSubscribed = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socketService.leaveStream(stream.id);
      cleanup().catch(console.error);
      updateViewerCount(stream.id, Math.max(0, stream.viewers - 1));
    };
  }, [stream.id, stream.viewers, updateViewerCount, isStreamHost, connectionState]);

  return (
    <div className="w-full bg-gray-800 rounded-lg overflow-hidden">
      {error ? (
        <div className="p-8 text-center text-red-500">
          <p>{error}</p>
        </div>
      ) : (
        <div>
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold">{stream.title}</h2>
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>{stream.creator}</span>
              <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
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