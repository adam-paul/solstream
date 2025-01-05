'use client'

import React, { useRef, useEffect } from 'react';
import { agoraService } from '@/lib/agoraService';

interface StreamViewerProps {
  streamId: string;
  title: string;
  ticker: string;
}

const StreamViewer: React.FC<StreamViewerProps> = ({ streamId, title, ticker }) => {
  const videoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const startViewing = async () => {
      try {
        await agoraService.startViewing(streamId, videoRef.current!);
      } catch (err) {
        console.error('Failed to start viewing:', err);
      }
    };

    startViewing();

    return () => {
      agoraService.stopBroadcast();
    };
  }, [streamId]);

  return (
    <div className="w-full bg-gray-800 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">{title} | ${ticker}</h2>
      </div>

      <div
        ref={videoRef}
        className="w-full aspect-video bg-black"
      />
    </div>
  );
};

export default StreamViewer;
