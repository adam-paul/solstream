'use client'

import React, { useRef, useEffect } from 'react';
import { agoraService } from '@/lib/agoraService';
import { Copy } from 'lucide-react';

interface StreamViewerProps {
  streamId: string;
  title: string;
  ticker: string;
  coinAddress: string;
}

const StreamViewer: React.FC<StreamViewerProps> = ({ streamId, title, ticker, coinAddress }) => {
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
    <div className="w-full bg-gray-800 rounded-lg p-4 mb-8 overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <h2 className="text-2xl font-bold text-yellow-400">{title} | ${ticker}</h2>
          <button
            onClick={() => {
              navigator.clipboard.writeText(coinAddress);
              const btn = document.activeElement as HTMLButtonElement;
              btn?.classList.add('animate-flash');
              setTimeout(() => btn?.classList.remove('animate-flash'), 200);
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 border border-white/10 rounded hover:bg-gray-600 transition-colors group"
          >
            <Copy size={14} className="text-gray-400 group-hover:text-white" />
            <div className="w-px h-4 bg-gray-600"></div>
            <span className="text-gray-300 font-mono text-sm">{coinAddress}</span>
          </button>
        </div>
      </div>

      <div
        ref={videoRef}
        className="w-full aspect-video bg-black"
      />
    </div>
  );
};

export default StreamViewer;
