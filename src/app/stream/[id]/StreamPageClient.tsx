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
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-[1800px] mx-auto px-8">
        <div className="flex justify-between items-center py-2 mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-6 h-6 bg-gray-700 rounded-full"></div>
            <button className="text-white hover:font-bold">
              [how it works]
            </button>
          </div>
          
          <div className="hidden md:block bg-yellow-400 text-black px-8 py-2 rounded-lg overflow-hidden flex-1 mx-8">
            <div className="flex space-x-8 animate-scroll">
              <span className="whitespace-nowrap">
                🎥 Currently watching: {stream.title}
              </span>
              <span className="whitespace-nowrap">
                👀 {stream.viewers} viewers
              </span>
            </div>
          </div>
          
          <WalletButton />
        </div>

        {/* Main Content with existing go back button */}
        <div className="mx-auto p-4">
          <button 
            onClick={() => router.push('/')}
            className="text-white hover:font-bold text-2xl mb-12 transition-all mx-auto block"
          >
            [go back]
          </button>

          <div className="w-full mx-auto">
            <StreamContainer 
              stream={stream} 
              isHost={isStreamHost(stream.id)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}