// src/components/ui/StreamComponent.tsx
'use client'

import React, { useRef, useEffect, useState } from 'react';
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { useInitializedStreamStore } from '@/lib/StreamStore';
import { DEFAULT_PREVIEW_CONFIG } from '@/config/preview';

// Initialize AgoraRTC only on the client side
let AgoraRTC: any;
if (typeof window !== 'undefined') {
  AgoraRTC = require('agora-rtc-sdk-ng').default;
}

interface StreamComponentProps {
  streamId: string;
  onClose: () => void;
}

const StreamComponent: React.FC<StreamComponentProps> = ({
  streamId,
  onClose,
}) => {
  // Refs for video and track management
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const tracksRef = useRef<{
    videoTrack: ICameraVideoTrack | null;
    audioTrack: IMicrophoneAudioTrack | null;
  }>({ videoTrack: null, audioTrack: null });
  
  // Preview management
  const previewIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Local state
  const [error, setError] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Get store methods
  const {
    getStream,
    endStream,
    updatePreview,
    isStreamHost
  } = useInitializedStreamStore();
  
  const stream = getStream(streamId);

  // Preview capture
  const capturePreview = React.useCallback(async () => {
    try {
      if (!tracksRef.current.videoTrack || !videoRef.current) {
        console.warn('[StreamComponent] Video track or ref not available for preview');
        return;
      }

      const canvas = document.createElement('canvas');
      const video = videoRef.current.querySelector('video');
      
      if (!video) {
        console.warn('[StreamComponent] Video element not found');
        return;
      }

      // Set dimensions with scale factor for performance
      const scaleFactor = 0.25;
      canvas.width = video.videoWidth * scaleFactor;
      canvas.height = video.videoHeight * scaleFactor;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.warn('[StreamComponent] Could not get canvas context');
        return;
      }

      // Draw scaled video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Compress preview
      const previewUrl = canvas.toDataURL('image/jpeg', 0.1);
      
      if (previewUrl.length > 100000) {
        console.warn('[StreamComponent] Preview too large, skipping update');
        return;
      }

      updatePreview(streamId, previewUrl);
      canvas.remove();
    } catch (err) {
      console.error('[StreamComponent] Failed to capture preview:', err);
    }
  }, [streamId, updatePreview]);

  // Cleanup function
  const cleanup = async () => {
    console.log('[StreamComponent] Starting cleanup...');
    
    try {
      // Clear preview interval
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
        previewIntervalRef.current = null;
      }

      // Clean up tracks
      if (tracksRef.current.videoTrack) {
        tracksRef.current.videoTrack.stop();
        await tracksRef.current.videoTrack.close();
      }
      
      if (tracksRef.current.audioTrack) {
        tracksRef.current.audioTrack.stop();
        await tracksRef.current.audioTrack.close();
      }

      // Clean up client
      if (clientRef.current) {
        clientRef.current.removeAllListeners();
        
        if (clientRef.current?.connectionState === 'CONNECTED') {
          const tracks = [tracksRef.current.audioTrack, tracksRef.current.videoTrack]
            .filter((track): track is ICameraVideoTrack | IMicrophoneAudioTrack => track !== null);
          
          if (tracks.length > 0) {
            await clientRef.current.unpublish(tracks);
          }
          await clientRef.current.leave();
        }
      }

      // Reset refs
      tracksRef.current = { videoTrack: null, audioTrack: null };
      clientRef.current = null;
      
      console.log('[StreamComponent] Cleanup completed');
    } catch (err) {
      console.error('[StreamComponent] Error during cleanup:', err);
      setError('Failed to clean up stream resources');
    }
  };

  // Handle stream end
  const handleEndStream = async () => {
    await cleanup();
    endStream(streamId);
    onClose();
  };

  // Initialize stream
  useEffect(() => {
    let isMounted = true;

    if (typeof window === 'undefined' || !AgoraRTC || !stream || !isStreamHost(streamId)) {
      return;
    }

    const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!AGORA_APP_ID) {
      setError('Agora App ID not configured');
      return;
    }

    const initStream = async () => {
      try {
        console.log('[StreamComponent] Initializing stream...');
        
        // Create and configure client
        if (!clientRef.current) {
          const client = AgoraRTC.createClient({ 
            mode: "live", 
            codec: "vp8",
            role: "host"
          });
          clientRef.current = client;
        }

        // Get token
        const response = await fetch(`/api/agora-token?channel=${streamId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch token');
        }
        const { token, uid } = await response.json();
        
        if (!token) {
          throw new Error('Failed to generate token');
        }

        // Join channel
        await clientRef.current!.join(
          AGORA_APP_ID,
          streamId,
          token,
          uid
        );

        // Create tracks
        const [audioTrack, videoTrack] = await Promise.all([
          AgoraRTC.createMicrophoneAudioTrack(),
          AgoraRTC.createCameraVideoTrack()
        ]);

        if (!isMounted) return;

        tracksRef.current = {
          audioTrack,
          videoTrack
        };

        // Publish tracks
        await clientRef.current!.publish([audioTrack, videoTrack]);

        if (videoRef.current) {
          videoTrack.play(videoRef.current);
        }

        setIsInitialized(true);
        console.log('[StreamComponent] Stream initialized successfully');

        // Set up preview capture
        setTimeout(async () => {
          if (isMounted) {
            await capturePreview();
            previewIntervalRef.current = setInterval(
              capturePreview,
              DEFAULT_PREVIEW_CONFIG.updateInterval
            );
          }
        }, DEFAULT_PREVIEW_CONFIG.initialDelay);

      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to start stream';
          console.error('[StreamComponent] Initialization error:', errorMessage);
          setError(errorMessage);
        }
      }
    };

    initStream();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [stream, streamId, isStreamHost, updatePreview, capturePreview]);

  // Verify host status
  if (!stream || !isStreamHost(streamId)) {
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
        <div className="text-red-500 p-4 bg-gray-900 rounded-lg">
          {error}
        </div>
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
