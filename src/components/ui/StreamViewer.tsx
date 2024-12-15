'use client'

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { IAgoraRTCClient, IAgoraRTC, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import type { Stream } from '@/lib/StreamStore';
import { useStreamStore } from '@/lib/StreamStore';

// Declare AgoraRTC variable
let AgoraRTC: IAgoraRTC;

// Initialize AgoraRTC only on the client side
if (typeof window !== 'undefined') {
  // Import directly since we're already checking for browser environment
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
  const store = useStreamStore();
  const updateViewerCount = store((state) => state.updateViewerCount);

  useEffect(() => {
    if (typeof window === 'undefined' || !AgoraRTC) {
      return;
    }

    const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!AGORA_APP_ID) {
      setError('Agora App ID not configured');
      return;
    }

    const initViewer = async () => {
      try {
        const client = AgoraRTC.createClient({ 
          mode: "live", 
          codec: "vp8",
          role: "audience"
        });
        clientRef.current = client;

        const channelName = stream.id;
        
        // Get token from our API
        const response = await fetch(`/api/agora-token?channel=${channelName}`);
        const { token, uid } = await response.json();
        
        if (!token) {
          throw new Error('Failed to generate token');
        }

        await client.join(
          AGORA_APP_ID,
          channelName,
          token,
          uid
        );

        client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType: "video" | "audio") => {
          await client.subscribe(user, mediaType);
          
          if (mediaType === "video" && videoRef.current) {
            user.videoTrack?.play(videoRef.current);
          }
          if (mediaType === "audio") {
            user.audioTrack?.play();
          }
        });

        updateViewerCount(stream.id, client.remoteUsers.length + 1);

        client.on("user-unpublished", async (user: IAgoraRTCRemoteUser) => {
          await client.unsubscribe(user);
        });

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to connect to stream';
        setError(errorMessage);
      }
    };

    initViewer();

    return () => {
      if (clientRef.current) {
        clientRef.current.remoteUsers.forEach((user) => {
          if (user.videoTrack) user.videoTrack.stop();
          if (user.audioTrack) user.audioTrack.stop();
        });
        clientRef.current.leave();
        updateViewerCount(stream.id, Math.max(0, stream.viewers - 1));
      }
    };
  }, [stream.id, stream.title, stream.viewers, updateViewerCount]);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
      <div className="relative w-full max-w-5xl mx-4">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white hover:text-gray-300"
        >
          <X size={24} />
        </button>

        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold">{stream.title}</h2>
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>{stream.creator}</span>
              <span>{stream.viewers} viewers</span>
            </div>
          </div>

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
        </div>
      </div>
    </div>
  );
};

export default StreamViewer;