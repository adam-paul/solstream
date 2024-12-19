'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { agoraService } from '@/lib/agoraService';
import { useInitializedStreamStore } from '@/lib/StreamStore';
import { streamLifecycle, StreamState, type StreamStateType } from '@/lib/streamLifecycle';
import type { Stream } from '@/types/stream';
import type { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

interface StreamViewerProps {
  stream: Stream;
}

const StreamViewer: React.FC<StreamViewerProps> = ({ stream }) => {
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<boolean>(true);
  
  // State
  const [error, setError] = useState<string>('');
  const [streamState, setStreamState] = useState<StreamStateType>(StreamState.INITIALIZING);
  
  // Store methods
  const {
    isStreamHost,
    isStreamActive,
    setUserRole
  } = useInitializedStreamStore();

  // Handle remote user media
  const handleUserPublished = useCallback(async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
    console.log('[StreamViewer] Remote user published:', { uid: user.uid, mediaType });
    
    try {
      if (!videoRef.current) return;
      
      await agoraService.handleUserPublished(videoRef.current, user, mediaType);
      console.log('[StreamViewer] Successfully subscribed to:', mediaType);
    } catch (err) {
      console.error('[StreamViewer] Subscribe error:', err);
      setError('Failed to subscribe to stream');
    }
  }, []);

  // Initialize viewer
  const initializeViewer = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      await streamLifecycle.initializeStream(stream, videoRef.current, 'viewer');
      agoraService.onUserPublished(handleUserPublished);
      await streamLifecycle.startStream(stream.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to initialize viewer');
    }
  }, [stream, handleUserPublished]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setError('');
    setStreamState(StreamState.INITIALIZING);
    streamLifecycle.cleanup(stream.id).then(() => {
      if (mountedRef.current) {
        initializeViewer();
      }
    });
  }, [stream.id, initializeViewer]);

  // Initialize on mount
  useEffect(() => {
    mountedRef.current = true;

    // Check if we can view this stream
    if (!stream || !isStreamActive(stream.id) || isStreamHost(stream.id)) {
      return;
    }

    // Set up state change listener
    const unsubscribe = streamLifecycle.onStateChange(stream.id, (newState) => {
      if (mountedRef.current) {
        setStreamState(newState);
        if (newState === StreamState.ERROR) {
          const error = streamLifecycle.getError(stream.id);
          if (error) setError(error.message);
        }
        if (newState === StreamState.READY) {
          setUserRole(stream.id, 'viewer');
        }
      }
    });

    initializeViewer();

    return () => {
      mountedRef.current = false;
      unsubscribe();
      streamLifecycle.cleanup(stream.id).catch(console.error);
    };
  }, [stream, initializeViewer, isStreamActive, isStreamHost, setUserRole]);

  // Check if user can view this stream
  if (isStreamHost(stream.id)) {
    return (
      <div className="text-red-500 p-4 bg-gray-900 rounded-lg">
        Cannot view your own stream as a viewer
      </div>
    );
  }

  return (
    <div className="w-full bg-gray-800 rounded-lg overflow-hidden">
      {error ? (
        <div className="text-red-500 p-4 bg-gray-900 rounded-lg">
          <p className="mb-4">{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded text-white"
          >
            Try Again
          </button>
        </div>
      ) : (
        <div>
          {/* Stream Header */}
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">{stream.title}</h2>
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>{stream.creator}</span>
              <span>
                {streamState === StreamState.READY ? 'Connected' : 'Connecting...'}
              </span>
            </div>
          </div>

          {/* Video Container */}
          <div
            ref={videoRef}
            className="w-full aspect-video bg-black"
          >
            {streamState === StreamState.INITIALIZING && (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <p>Connecting to stream...</p>
              </div>
            )}
          </div>

          {/* Stream Info */}
          {stream.description && (
            <div className="p-4 border-t border-gray-700">
              <p className="text-gray-400">{stream.description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StreamViewer;
