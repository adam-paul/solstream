// StreamPageClient.tsx
'use client'

import React from 'react';
import { useRouter } from 'next/navigation';
import StreamContainer from '@/components/ui/StreamContainer';
import { useStreamStore } from '@/lib/StreamStore';
import { WalletButton } from '@/components/wallet/WalletButton';

interface StreamPageClientProps {
  streamId: string;
}

export default function StreamPageClient({ streamId }: StreamPageClientProps) {
  const router = useRouter();
  const { getStream, isStreamHost } = useStreamStore();
  const stream = getStream(streamId);

  if (!stream) {
    router.push('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="bg-yellow-400 text-black p-2 rounded-lg mb-6 overflow-hidden">
        <div className="flex space-x-8 animate-scroll">
          <span className="whitespace-nowrap">
            🎥 Currently watching: {stream.title}
          </span>
          <span className="whitespace-nowrap">
            👀 {stream.viewers} viewers
          </span>
        </div>
      </div>

      {/* Wallet Button */}
      <div className="flex justify-end mb-4 px-4">
        <WalletButton />
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <button 
          onClick={() => router.push('/')}
          className="text-white hover:font-bold text-2xl mb-12 transition-all text-center"
        >
          [go back]
        </button>

        <div className="w-full max-w-5xl mx-auto">
          <StreamContainer 
            stream={stream} 
            isHost={isStreamHost(stream.id)}
          />
        </div>
      </div>
    </div>
  );
}
