// src/components/ui/StreamViewer.tsx
import React, { useEffect, useRef, useState } from 'react';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IAgoraRTC } from 'agora-rtc-sdk-ng';
import type { Stream } from '@/lib/StreamStore';
import { useStreamStore } from '@/lib/StreamStore';
import { socketService } from '@/lib/socketService';

// Initialize AgoraRTC only on the client side
let AgoraRTC: IAgoraRTC;
if (typeof window !== 'undefined') {
  AgoraRTC = require('agora-rtc-sdk-ng').default;  // Note the .default here
}

interface StreamViewerProps {
  stream: Stream;
}

const StreamViewer: React.FC<StreamViewerProps> = ({ stream }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const [error, setError] = useState<string>('');
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

    let isSubscribed = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const cleanup = async () => {
      if (clientRef.current) {
        try {
          // Remove all remote users first
          clientRef.current.remoteUsers.forEach(async user => {
            if (user.videoTrack) {
              user.videoTrack.stop();
              await clientRef.current?.unsubscribe(user);
            }
          });

          // Leave the channel
          await clientRef.current.leave();
          
          // Clear the client
          clientRef.current = null;
          setConnectionState('connecting');
          
          console.log('Cleanup completed successfully');
        } catch (err) {
          console.error('Cleanup error:', err);
        }
      }
    };

    const initViewer = async () => {
      try {
        await cleanup();

        // Join the socket room
        socketService.joinStream(stream.id);

        // Create client with specific configuration
        const client = AgoraRTC.createClient({
          mode: "live",
          codec: "vp8",
          role: "audience"
        });

        // Set up event handlers before joining
        client.on("connection-state-change", (curState, prevState) => {
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

        // Store the client reference
        clientRef.current = client;

        // Get token from our API
        const response = await fetch(`/api/agora-token/?channel=${stream.id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch token');
        }
        
        const { token, uid, appId } = await response.json();
        if (!token || !appId) {
          throw new Error('Invalid token response');
        }

        console.log('Joining with token:', { channelName: stream.id, uid });
        await client.join(appId, stream.id, token, uid);

        // Set up user-published handler
        client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType) => {
          if (!isSubscribed) return;
          
          try {
            await client.subscribe(user, mediaType);
            console.log("Subscribe success", mediaType);

            if (mediaType === "video" && videoRef.current) {
              user.videoTrack?.play(videoRef.current);
            }
            if (mediaType === "audio") {
              user.audioTrack?.play();
            }
          } catch (err) {
            console.error('Subscribe error:', err);
          }
        });

        // Update viewer count handlers
        const updateCount = () => {
          if (isSubscribed && clientRef.current) {
            updateViewerCount(stream.id, clientRef.current.remoteUsers.length + 1);
          }
        };

        client.on("user-joined", updateCount);
        client.on("user-left", updateCount);
        client.on("user-published", updateCount);
        client.on("user-unpublished", updateCount);

        setConnectionState('connected');
        updateCount();
        
      } catch (err) {
        console.error('Connection error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to connect to stream';
        setError(errorMessage);
        
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          console.log(`Retrying connection (${retryCount}/${MAX_RETRIES})...`);
          setTimeout(initViewer, 2000); // Retry after 2 seconds
        } else {
          setConnectionState('failed');
        }
      }
    };

    initViewer();

    return () => {
      isSubscribed = false;
      socketService.leaveStream(stream.id);
      cleanup().catch(console.error);
      if (stream?.viewers) {
        updateViewerCount(stream.id, Math.max(0, stream.viewers - 1));
      }
    };
  }, [stream.id, stream.viewers, updateViewerCount, isStreamHost]);

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
