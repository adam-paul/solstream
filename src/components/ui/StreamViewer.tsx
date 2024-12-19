'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { agoraService } from '@/lib/agoraService';
import { useInitializedStreamStore } from '@/lib/StreamStore';
import { streamLifecycle, StreamState, type StreamStateType } from '@/lib/streamLifecycle';
import type { Stream } from '@/types/stream';
import type { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

interface StreamViewerProps {
  stream: Stream;
}

interface ConnectionStates {
  agora: string;
  socket: string;
  publish: 'unpublished' | 'publishing' | 'published';
}

const StreamStatusIndicator: React.FC<{
  state: StreamStateType;
  connectionStates?: ConnectionStates;
}> = ({ state, connectionStates }) => {
  const getStatusColor = () => {
    switch (state) {
      case StreamState.LIVE:
        return 'bg-green-500';
      case StreamState.ERROR:
        return 'bg-red-500';
      default:
        return 'bg-yellow-500';
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`} />
      <span className="text-sm text-gray-400">
        {state === StreamState.LIVE ? 'Live' : state}
        {connectionStates && ` (${connectionStates.agora.toLowerCase()})`}
      </span>
    </div>
  );
};

const StreamViewer: React.FC<StreamViewerProps> = ({ stream }) => {
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<boolean>(true);
  const retryTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  // State
  const [error, setError] = useState<string>('');
  const [streamState, setStreamState] = useState<StreamStateType>(StreamState.INITIALIZING);
  const [connectionStates, setConnectionStates] = useState<ConnectionStates | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const MAX_RETRIES = 3;
  
  // Store methods
  const { isStreamHost } = useInitializedStreamStore();

  // Handle remote user media
  const handleUserPublished = useCallback(async (
    user: IAgoraRTCRemoteUser,
    mediaType: 'audio' | 'video'
  ) => {
    console.log('[StreamViewer] Remote user published:', { uid: user.uid, mediaType });
    
    try {
      if (!videoRef.current) {
        console.warn('[StreamViewer] Video container not ready');
        return;
      }
      
      await agoraService.handleUserPublished(videoRef.current, user, mediaType);
    } catch (err) {
      console.error('[StreamViewer] Subscribe error:', err);
      setError('Failed to subscribe to stream');
    }
  }, []);

  // Handle connection retry
  const handleRetry = useCallback(async () => {
    if (retryCount >= MAX_RETRIES) {
      setError('Maximum retry attempts reached. Please refresh the page.');
      return;
    }

    setError('');
    setStreamState(StreamState.INITIALIZING);
    setRetryCount(prev => prev + 1);
    
    try {
      // Clean up existing resources
      await streamLifecycle.cleanup(stream.id);
      
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!videoRef.current || !mountedRef.current) return;

      // Re-initialize stream
      await streamLifecycle.initializeStream(stream, videoRef.current, 'viewer');
      await streamLifecycle.startStream(stream.id);
      
      if (mountedRef.current) {
        setStreamState(StreamState.LIVE);
        setRetryCount(0); // Reset retry count on success
      }
    } catch (error) {
      if (mountedRef.current) {
        console.error('[StreamViewer] Retry failed:', error);
        setError(error instanceof Error ? error.message : 'Failed to reconnect');
        
        // Schedule another retry
        if (retryCount < MAX_RETRIES) {
          retryTimeoutRef.current = setTimeout(handleRetry, 3000);
        }
      }
    }
  }, [stream, retryCount]);

  // Initialize stream connection
  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      if (!videoRef.current) return;

      try {
        // Use new connectViewer method that ensures proper connection order
        await streamLifecycle.connectViewer(stream, videoRef.current);
        
        // Set up Agora event handlers for remote user media
        const client = await agoraService.initializeClient({
          role: 'audience',
          streamId: stream.id
        });

        client.on('user-published', handleUserPublished);
        
        if (mountedRef.current) {
          setStreamState(StreamState.LIVE);
        }
      } catch (error) {
        if (mountedRef.current) {
          console.error('[StreamViewer] Initialization failed:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to connect to stream';
          setError(errorMessage);
          
          // Only retry if it's not a "host not active" error
          if (!errorMessage.includes('Host is not active')) {
            retryTimeoutRef.current = setTimeout(handleRetry, 3000);
          }
        }
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      streamLifecycle.cleanup(stream.id).catch(console.error);
    };
  }, [stream, handleRetry, handleUserPublished]);

  // Monitor connection states
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (mountedRef.current) {
        const states = streamLifecycle.getConnectionStates(stream.id);
        if (states) {
          // Ensure all required fields are present before setting state
          const connStates: ConnectionStates = {
            agora: states.agora,
            socket: states.socket,
            publish: 'unpublished' // Default value since it's not in returned state
          };
          setConnectionStates(connStates);
          
          // Check for disconnected state
          if (states.agora === 'DISCONNECTED' || states.socket === 'disconnected') {
            handleRetry();
          }
        }
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [stream.id, handleRetry]);

  // Subscribe to stream lifecycle state changes
  useEffect(() => {
    const unsubscribe = streamLifecycle.addStateListener(stream.id, (newState: StreamStateType) => {
      if (mountedRef.current) {
        setStreamState(newState);
        if (newState === StreamState.ERROR) {
          const diagnostics = streamLifecycle.getDiagnostics(stream.id);
          setError(diagnostics?.error?.message || 'Stream encountered an error');
        }
      }
    });

    return () => unsubscribe();
  }, [stream.id]);

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
      {/* Stream Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">{stream.title}</h2>
            <div className="text-sm text-gray-400 mt-1">{stream.creator}</div>
          </div>
          <StreamStatusIndicator 
            state={streamState}
            connectionStates={connectionStates || undefined}
          />
        </div>
      </div>

      {/* Video Container */}
      <div className="relative">
        <div
          ref={videoRef}
          className="w-full aspect-video bg-black"
        />
        
        {/* Loading/Error States */}
        {(streamState === StreamState.INITIALIZING || error) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
            {error ? (
              <div className="text-center px-4">
                <AlertCircle className="mx-auto mb-2 text-red-500" size={24} />
                <p className="text-red-500 mb-4">{error}</p>
                {retryCount < MAX_RETRIES && (
                  <button
                    onClick={handleRetry}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded text-white flex items-center"
                  >
                    <RefreshCw className="mr-2" size={16} />
                    Retry Connection
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center">
                <Loader2 className="mx-auto mb-2 animate-spin" size={24} />
                <p className="text-gray-400">Connecting to stream...</p>
              </div>
            )}
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
  );
};

export default StreamViewer;
