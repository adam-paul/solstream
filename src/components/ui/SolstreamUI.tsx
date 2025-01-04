// src/components/ui/SolstreamUI.tsx
'use client'

import Image from 'next/image';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, TrendingUp, Clock, Eye, ChevronDown } from 'lucide-react';
import StreamCreationModal from './StreamCreationModal';
import StreamTile from './StreamTile';
import { useStreamStore } from '@/lib/StreamStore';
import { WalletButton } from '@/components/wallet/WalletButton';

// Maintain mock activity for UI demonstration
const mockActivity = [
  "🎥 NewStream launched for $SOL",
  "👀 Trading101 just hit 1000 viewers",
  "🚀 Technical Analysis stream starting for $BONK"
];

export default function SolstreamUI() {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<'featured' | 'newest' | 'viewers'>('featured');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showStreamModal, setShowStreamModal] = useState<boolean>(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const { getAllStreams } = useStreamStore();
  const streams = getAllStreams();

  // Navigation handlers
  const handleStreamCreated = (streamId: string) => {
    setShowStreamModal(false);
    router.push(`/stream/${streamId}`);
  };

  const handleStreamSelect = (streamId: string) => {
    router.push(`/stream/${streamId}`);
  };

  // Sort streams based on selected criteria
  const sortedStreams = [...streams].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'viewers':
        return b.viewers - a.viewers;
      default:
        return 0;
    }
  });

  // Filter streams based on search query
  const filteredStreams = sortedStreams.filter(stream =>
    stream.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stream.ticker?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stream.creator.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Featured stream is the active one with the most viewers
  const featuredStream = filteredStreams.length > 0 
    ? filteredStreams.reduce((prev, current) => 
        current.viewers > prev.viewers ? current : prev
      )
    : null;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Top Navigation Bar */}
      <div className="flex justify-between items-center px-4 py-2 mb-8">
        <div className="flex items-center space-x-4">
          {/* Placeholder icon - replace with actual icon later */}
          <div className="w-6 h-6 bg-gray-700 rounded-full"></div>
          <button className="text-white hover:font-bold transition-all">
            [how it works]
          </button>
        </div>
        
        {/* Activity Ticker */}
        <div className="bg-yellow-400 text-black px-8 py-2 rounded-lg overflow-hidden flex-1 mx-8">
          <div className="flex space-x-8 animate-scroll">
            {mockActivity.map((activity, index) => (
              <span key={index} className="whitespace-nowrap">{activity}</span>
            ))}
          </div>
        </div>
        
        <WalletButton />
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto flex flex-col items-center">
        {/* New Stream Button */}
        <button 
          onClick={() => setShowStreamModal(true)}
          className="text-white hover:font-bold text-2xl mb-12 transition-all"
        >
          [start a new stream]
        </button>

        {/* Stream Creation Modal */}
        <StreamCreationModal
          isOpen={showStreamModal}
          onClose={() => setShowStreamModal(false)}
          onStreamCreated={handleStreamCreated}
        />

        {/* Featured Stream Tile */}
        {featuredStream && (
          <div 
            className="w-full max-w-md bg-gray-800 rounded-lg p-4 mb-8 cursor-pointer"
            onClick={() => handleStreamSelect(featuredStream.id)}
          >
            <h2 className="text-xl font-bold text-yellow-400 mb-2">Current Top Stream</h2>
            <div className="flex items-center space-x-4">
              <div className="relative w-16 h-16 bg-gray-700 rounded-full overflow-hidden">
                <Image
                  src={featuredStream.thumbnail}
                  alt={featuredStream.title}
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <h3 className="text-lg">{featuredStream.title}</h3>
                <p className="text-gray-400">
                  {featuredStream.viewers} viewers • Started {new Date(featuredStream.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="w-full max-w-xl mb-8 flex items-center justify-center space-x-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="search streams by token"
              className="w-full bg-gray-800 rounded-lg py-2 px-4 pr-10 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="absolute right-3 top-2.5 text-gray-400" size={20} />
          </div>
          <button className="bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg">
            search
          </button>
        </div>

        {/* Sort Dropdown */}
        <div className="relative mb-6 w-full max-w-5xl">
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            className="bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg flex items-center space-x-2"
          >
            <span>sort: {sortBy}</span>
            <ChevronDown size={16} />
          </button>
          
          {showSortDropdown && (
            <div className="absolute top-full mt-1 bg-gray-800 rounded-lg shadow-lg overflow-hidden z-10">
              <button
                className="w-full px-4 py-2 text-left hover:bg-gray-700 flex items-center space-x-2"
                onClick={() => {
                  setSortBy('featured');
                  setShowSortDropdown(false);
                }}
              >
                <TrendingUp size={16} />
                <span>sort: featured</span>
              </button>
              <button
                className="w-full px-4 py-2 text-left hover:bg-gray-700 flex items-center space-x-2"
                onClick={() => {
                  setSortBy('newest');
                  setShowSortDropdown(false);
                }}
              >
                <Clock size={16} />
                <span>sort: newest</span>
              </button>
              <button
                className="w-full px-4 py-2 text-left hover:bg-gray-700 flex items-center space-x-2"
                onClick={() => {
                  setSortBy('viewers');
                  setShowSortDropdown(false);
                }}
              >
                <Eye size={16} />
                <span>sort: most viewers</span>
              </button>
            </div>
          )}
        </div>

        {/* Stream Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 w-full max-w-5xl">
          {filteredStreams.map((stream) => (
            <StreamTile
              key={stream.id}
              stream={stream}
              onClick={() => handleStreamSelect(stream.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
