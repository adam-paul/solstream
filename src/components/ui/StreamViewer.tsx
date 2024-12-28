'use client'

import React, { useRef, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { agoraService } from '@/lib/agoraService';
import type { Stream } from '@/types/stream';
import { socketService } from '@/lib/socketService';

interface StreamViewerProps {
  stream: Stream;
}

const StreamViewer: React.FC<StreamViewerProps> = ({ stream }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const containerRef = videoRef.current; // Store ref value

    const initViewer = async () => {
      if (!containerRef) {
        setError('Video container not initialized');
        return;
      }

      if (!stream.isLive) {
        setError('Stream is not live');
        return;
      }

      try {
        // Join the stream
        await agoraService.setupStream({
          streamId: stream.id,
          role: 'audience',
          container: containerRef
        });

        // Notify backend about viewer joining
        socketService.joinStream(stream.id);

      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to join stream');
      }
    };

    initViewer();

    // Cleanup
    return () => {
      isMounted = false;
      if (stream.id) {
        socketService.leaveStream(stream.id);
      }
      if (containerRef) {
        // Clear video container before cleanup
        while (containerRef.firstChild) {
          containerRef.removeChild(containerRef.firstChild);
        }
      }
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
              'bg-green-500'
            } animate-pulse`} />
            <span className="text-sm text-gray-400">
              {error ? 'Error' : 
               !stream.isLive ? 'Stream Offline' : 
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
        
        {/* Error or Offline State */}
        {(error || !stream.isLive) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
            {error ? (
              <p className="text-red-500">{error}</p>
            ) : !stream.isLive ? (
              <div className="text-center">
                <Loader2 className="mx-auto mb-2 animate-spin" size={24} />
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
