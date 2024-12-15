'use client'

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { IAgoraRTCClient, IAgoraRTC, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
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
  onClose: () => void;
}

const StreamViewer: React.FC<StreamViewerProps> = ({ stream, onClose }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const [error, setError] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  
  const store = useStreamStore();
  const updateViewerCount = store((state) => state.updateViewerCount);
  const isStreamHost = store((state) => state.isStreamHost(stream.id));

  useEffect(() => {
    // Early return if user is the host
    if (isStreamHost) {
      setError('Cannot view your own stream as a viewer');
      onClose();
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

    const initViewer = async () => {
      try {
        // Join stream in socket
        socketService.joinStream(stream.id);

        const client = AgoraRTC.createClient({ 
          mode: "live", 
          codec: "vp8",
          role: "audience"
        });
        clientRef.current = client;

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

        // Handle remote user publishing
        client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType: "video" | "audio") => {
          await client.subscribe(user, mediaType);
          
          if (mediaType === "video" && videoRef.current) {
            user.videoTrack?.play(videoRef.current);
          }
          if (mediaType === "audio") {
            user.audioTrack?.play();
          }
        });

        // Handle user count updates
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

    return () => {
      isSubscribed = false;
      socketService.leaveStream(stream.id);
      if (clientRef.current) {
        // Cleanup remote users
        clientRef.current.remoteUsers.forEach((user) => {
          if (user.videoTrack) user.videoTrack.stop();
          if (user.audioTrack) user.audioTrack.stop();
        });
        
        // Leave the channel
        clientRef.current.leave().then(() => {
          updateViewerCount(stream.id, Math.max(0, stream.viewers - 1));
        }).catch(console.error);
      }
    };
  }, [stream.id, stream.viewers, updateViewerCount, isStreamHost, onClose]);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
      <div className="relative w-full max-w-5xl mx-4">
        {/* Viewer count display */}
        <div className="absolute -top-12 left-0 text-gray-400">
          {stream.viewers} viewer{stream.viewers !== 1 ? 's' : ''} watching
        </div>
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white hover:text-gray-300"
        >
          <X size={24} />
        </button>

        <div className="bg-gray-800 rounded-lg overflow-hidden">
          {/* Stream header */}
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold">{stream.title}</h2>
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>{stream.creator}</span>
              <span className="flex items-center">
                {isConnected ? (
                  <span className="flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                    Connecting...
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Stream content */}
          {error ? (
            <div className="p-8 text-center text-red-500">
              <p>{error}</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          ) : (
            <div
              ref={videoRef}
              className="w-full aspect-video bg-gray-900"
            />
          )}

          {/* Stream details */}
          {stream.description && (
            <div className="p-4 border-t border-gray-700">
              <p className="text-gray-300">{stream.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StreamViewer;
