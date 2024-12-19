// src/components/ui/StreamComponent.tsx
'use client'

import React, { useRef, useEffect, useState } from 'react';
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { useInitializedStreamStore } from '@/lib/StreamStore';
import { socketService } from '@/lib/socketService';
import { DEFAULT_PREVIEW_CONFIG } from '@/config/preview';

let AgoraRTC: any;
if (typeof window !== 'undefined') {
  AgoraRTC = require('agora-rtc-sdk-ng').default;
}

interface StreamComponentProps {
  streamId: string;
  onClose: () => void;
}

const INITIALIZATION_TIMEOUT = 15000; // 15 seconds

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
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Get store methods
  const {
    getStream,
    endStream,
    updatePreview,
    isStreamHost
  } = useInitializedStreamStore();
  
  const stream = getStream(streamId);

  // Preview capture function remains the same
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
  const cleanup = React.useCallback(async () => {
    console.log('[StreamComponent] Starting cleanup...');
    
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
  }, []);

  // Initialize Agora client
  const initializeAgora = React.useCallback(async () => {
    console.log('[StreamComponent] Starting initialization');
    console.log('[StreamComponent] Current stream:', stream);
    if (!stream || !AgoraRTC) {
      throw new Error('Stream or AgoraRTC not available');
    }

    const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!AGORA_APP_ID) {
      throw new Error('Agora App ID not configured');
    }

    // Create and configure client
    const client = AgoraRTC.createClient({ 
      mode: "live", 
      codec: "vp8",
      role: "host"
    });
    clientRef.current = client;

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
    await client.join(AGORA_APP_ID, streamId, token, uid);

    // Create tracks
    const [audioTrack, videoTrack] = await Promise.all([
      AgoraRTC.createMicrophoneAudioTrack(),
      AgoraRTC.createCameraVideoTrack()
    ]);

    tracksRef.current = {
      audioTrack,
      videoTrack
    };

    // Publish tracks
    await client.publish([audioTrack, videoTrack]);

    if (videoRef.current) {
      videoTrack.play(videoRef.current);
    }

    return true;
  }, [stream, streamId]);

  // Handle stream end
  const handleEndStream = async () => {
    await cleanup();
    endStream(streamId);
    onClose();
  };

  // Effect to handle stream initialization
  useEffect(() => {
    let isMounted = true;
    let initTimeout: NodeJS.Timeout;

    const initialize = async () => {
      try {
        setIsInitializing(true);
        
        // Set initialization timeout
        initTimeout = setTimeout(() => {
          if (isMounted) {
            setError('Stream initialization timed out');
            setIsInitializing(false);
            cleanup();
          }
        }, INITIALIZATION_TIMEOUT);

        // Wait for stream confirmation
        const confirmStream = new Promise<void>((resolve, reject) => {
          console.log('[StreamComponent] Waiting for stream confirmation');
          const onStreamStarted = (confirmedStream: any) => {
            console.log('[StreamComponent] Stream confirmation received:', confirmedStream);
            if (confirmedStream.id === streamId) {
              socketService.onStreamStarted(onStreamStarted); // Cleanup listener
              resolve();
            }
          };
        
          const onError = (error: { message: string }) => {
            if (error.message.includes(streamId)) {
              socketService.onStreamStarted(onStreamStarted);
              socketService.onError(onError);
              reject(new Error(error.message));
            }
          };
        
          socketService.onStreamStarted(onStreamStarted);
          socketService.onError(onError);
        });

        await confirmStream;

        // Initialize Agora
        await initializeAgora();

        if (isMounted) {
          setIsInitializing(false);
          
          // Start preview capture
          setTimeout(async () => {
            if (isMounted) {
              await capturePreview();
              previewIntervalRef.current = setInterval(
                capturePreview,
                DEFAULT_PREVIEW_CONFIG.updateInterval
              );
            }
          }, DEFAULT_PREVIEW_CONFIG.initialDelay);
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to initialize stream';
          console.error('[StreamComponent] Initialization error:', errorMessage);
          setError(errorMessage);
          setIsInitializing(false);
        }
      } finally {
        clearTimeout(initTimeout);
      }
    };

    if (typeof window !== 'undefined' && stream && isStreamHost(streamId)) {
      initialize();
    }

    return () => {
      isMounted = false;
      clearTimeout(initTimeout);
      cleanup();
    };
  }, [stream, streamId, isStreamHost, initializeAgora, cleanup, capturePreview]);

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
          >
            {isInitializing && (
              <div className="flex items-center justify-center h-full">
                <p className="text-white">Initializing stream...</p>
              </div>
            )}
          </div>
          {!isInitializing && stream.viewers > 0 && (
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
