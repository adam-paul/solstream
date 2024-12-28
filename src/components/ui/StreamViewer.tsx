'use client'

import React, { useRef, useEffect, useState } from 'react';
import { Loader2, AlertCircle, Clock } from 'lucide-react';
import { agoraService } from '@/lib/agoraService';
import type { Stream } from '@/types/stream';

interface StreamViewerProps {
  stream: Stream;
}

const StreamViewer: React.FC<StreamViewerProps> = ({ stream }) => {
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<boolean>(true);
  
  // State
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);

  // Single error handler for viewer media operations
  const handleMediaError = (operation: string, err: unknown) => {
    const message = err instanceof Error ? err.message : 'Media operation failed';
    setError(`${operation}: ${message}`);
    setTimeout(() => setError(null), 5000);
  };

  // Initialize stream connection
  useEffect(() => {
    mountedRef.current = true;
  
    const initialize = async () => {
      if (!videoRef.current) {
        setIsConnecting(false);
        return;
      }
  
      try {
        console.log('Starting viewer initialization:', { 
          streamId: stream.id, 
          isLive: stream.isLive 
        });
        setIsConnecting(true);
        setError(null);
  
        await agoraService.initializeClient({
          role: 'audience',
          streamId: stream.id,
          container: videoRef.current
        });
        
        if (mountedRef.current) {
          setIsConnecting(false);
        }
      } catch (err) {
        console.error('Viewer initialization failed:', err);
        if (mountedRef.current) {
          handleMediaError('Failed to connect to stream', err);
          setIsConnecting(false);
        }
      }
    };
  
    initialize();
  
    return () => {
      console.log('Cleaning up viewer connection');
      mountedRef.current = false;
      agoraService.cleanup().catch(console.error);
    };
  }, [stream.id, stream.isLive]);

  return (
    <div className="w-full bg-gray-800 rounded-lg overflow-hidden">
      {/* Stream Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">{stream.title}</h2>
            <div className="text-sm text-gray-400 mt-1">{stream.creator}</div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              error ? 'bg-red-500' : 
              !stream.isLive ? 'bg-yellow-500' :
              isConnecting ? 'bg-yellow-500' : 
              'bg-green-500'
            } animate-pulse`} />
            <span className="text-sm text-gray-400">
              {error ? 'Error' : 
               !stream.isLive ? 'Waiting for stream' :
               isConnecting ? 'Connecting' : 
               'Live'}
            </span>
          </div>
        </div>
      </div>

      {/* Video Container */}
      <div className="relative">
        <div
          ref={videoRef}
          className="w-full aspect-video bg-black"
        />
        
        {/* Loading/Error/Waiting States */}
        {(isConnecting || error || !stream.isLive) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
            {error ? (
              <div className="text-center px-4">
                <AlertCircle className="mx-auto mb-2 text-red-500" size={24} />
                <p className="text-red-500 mb-4">{error}</p>
              </div>
            ) : isConnecting ? (
              <div className="text-center">
                <Loader2 className="mx-auto mb-2 animate-spin" size={24} />
                <p className="text-gray-400">Connecting to stream...</p>
              </div>
            ) : !stream.isLive ? (
              <div className="text-center">
                <Clock className="mx-auto mb-2" size={24} />
                <p className="text-gray-400">Waiting for stream to start...</p>
              </div>
            ) : null}
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
