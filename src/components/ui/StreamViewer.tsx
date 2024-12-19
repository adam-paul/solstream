'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { agoraService } from '@/lib/agoraService';
import { useInitializedStreamStore } from '@/lib/StreamStore';
import type { Stream } from '@/types/stream';
import type { IAgoraRTCRemoteUser, ConnectionState } from 'agora-rtc-sdk-ng';

interface StreamViewerProps {
  stream: Stream;
}

const CONNECTION_TIMEOUT = 15000; // 15 seconds

const StreamViewer: React.FC<StreamViewerProps> = ({ stream }) => {
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  // State
  const [error, setError] = useState<string>('');
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  
  // Store methods
  const {
    isStreamHost,
    isStreamActive,
    setUserRole
  } = useInitializedStreamStore();

  // Cleanup function
  const cleanup = useCallback(async () => {
    console.log('[StreamViewer] Starting cleanup...');
    try {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      if (videoRef.current) {
        // Clear the video container
        while (videoRef.current.firstChild) {
          videoRef.current.removeChild(videoRef.current.firstChild);
        }
      }
      await agoraService.cleanup();
      setUserRole(stream.id, null);
    } catch (err) {
      console.error('[StreamViewer] Cleanup error:', err);
    }
  }, [stream.id, setUserRole]);

  // Handle connection state changes
  const handleConnectionStateChange = useCallback((state: ConnectionState) => {
    console.log('[StreamViewer] Connection state:', state);
    
    switch (state) {
      case 'CONNECTED':
        setConnectionState('connected');
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        setUserRole(stream.id, 'viewer');
        break;
      case 'DISCONNECTED':
        setConnectionState('failed');
        setUserRole(stream.id, null);
        break;
      default:
        break;
    }
  }, [stream.id, setUserRole]);

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
    try {
      console.log('[StreamViewer] Initializing viewer...');
      
      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (connectionState === 'connecting') {
          setError('Connection timeout - please try again');
          setConnectionState('failed');
          cleanup();
        }
      }, CONNECTION_TIMEOUT);

      // Initialize Agora client for viewing
      await agoraService.initializeClient({
        role: 'audience',
        streamId: stream.id
      });

      // Set up event handlers
      agoraService.onConnectionStateChange(handleConnectionStateChange);
      agoraService.onUserPublished(handleUserPublished);

      console.log('[StreamViewer] Initialization complete');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to stream';
      console.error('[StreamViewer] Initialization error:', errorMessage);
      setError(errorMessage);
      setConnectionState('failed');
      cleanup();
    }
  }, [stream.id, connectionState, cleanup, handleConnectionStateChange, handleUserPublished]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setError('');
    setConnectionState('connecting');
    cleanup().then(() => {
      initializeViewer();
    });
  }, [cleanup, initializeViewer]);

  // Initialize on mount
  useEffect(() => {
    let mounted = true;

    // Check if we can view this stream
    if (!stream || !isStreamActive(stream.id) || isStreamHost(stream.id)) {
      return;
    }

    const initialize = async () => {
      try {
        await initializeViewer();
      } catch (error) {
        if (mounted) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to initialize viewer';
          setError(errorMessage);
          setConnectionState('failed');
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [stream, cleanup, initializeViewer, isStreamActive, isStreamHost]);

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
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
          >
            Try Again
          </button>
        </div>
      ) : (
        <div>
          {/* Stream Header */}
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold">{stream.title}</h2>
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>{stream.creator}</span>
              <span>{connectionState === 'connected' ? 'Connected' : 'Connecting...'}</span>
            </div>
          </div>

          {/* Video Container */}
          <div
            ref={videoRef}
            className="w-full aspect-video bg-gray-900"
          >
            {connectionState === 'connecting' && (
              <div className="w-full h-full flex items-center justify-center text-white">
                <p>Connecting to stream...</p>
              </div>
            )}
          </div>

          {/* Stream Info */}
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
