'use client'

import Image from 'next/image';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, TrendingUp, Clock, Eye, ChevronDown, Check } from 'lucide-react';
import StreamCreationModal from './StreamCreationModal';
import StreamTile from './StreamTile';
import { useStreamStore } from '@/lib/StreamStore';
import { WalletButton } from '@/components/wallet/WalletButton';

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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { getAllStreams } = useStreamStore();
  const streams = getAllStreams();

  // Clickaway handler for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSortDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStreamCreated = (streamId: string) => {
    setShowStreamModal(false);
    router.push(`/stream/${streamId}`);
  };

  const handleStreamSelect = (streamId: string) => {
    router.push(`/stream/${streamId}`);
  };

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

  const filteredStreams = sortedStreams.filter(stream =>
    stream.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stream.ticker?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stream.creator.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const featuredStream = filteredStreams.length > 0 
    ? filteredStreams.reduce((prev, current) => 
        current.viewers > prev.viewers ? current : prev
      )
    : null;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Top Navigation Bar */}
      <div className="max-w-[1800px] mx-auto px-8">
        <div className="flex justify-between items-center py-2 mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-6 h-6 bg-gray-700 rounded-full"></div>
            <button className="text-white hover:font-bold">
              [how it works]
            </button>
          </div>
          
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
        <div className="flex flex-col items-center">
          <button 
            onClick={() => setShowStreamModal(true)}
            className="text-white hover:font-bold text-2xl mb-12 transition-all"
          >
            [start a new stream]
          </button>

          <StreamCreationModal
            isOpen={showStreamModal}
            onClose={() => setShowStreamModal(false)}
            onStreamCreated={handleStreamCreated}
          />

          {/* Featured Stream Tile */}
          <div className="w-full max-w-md bg-gray-800 rounded-lg p-4 mb-8">
            <h2 className="text-xl font-bold text-yellow-400 mb-2">Current Top Stream</h2>
            {featuredStream ? (
              <div 
                className="flex items-center space-x-4 cursor-pointer"
                onClick={() => handleStreamSelect(featuredStream.id)}
              >
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
            ) : (
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center">
                  <Eye className="text-gray-500" size={24} />
                </div>
                <div>
                  <h3 className="text-xl text-gray-500">No active streams</h3>
                  <p className="text-gray-400">
                    Start streaming to be featured here
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="w-full max-w-xl mb-8 flex items-center justify-center space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="search streams by token"
                className="w-full bg-green-300 text-black placeholder-gray-700 rounded-lg py-2 px-4 pr-10 
                         focus:outline-none focus:ring-2 focus:ring-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="absolute right-3 top-2.5 text-gray-700" size={20} />
            </div>
            <button className="bg-green-300 hover:bg-emerald-500 px-4 py-2 rounded-lg text-black">
              search
            </button>
          </div>

          {/* Sort Dropdown */}
          <div className="w-full max-w-[1800px] mb-6" ref={dropdownRef}>
            <div className="relative inline-block">
              <button
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className="bg-green-300 hover:bg-emerald-400 px-4 py-2 rounded-lg flex items-center space-x-2 text-black"
              >
                <span>sort: {sortBy}</span>
                <ChevronDown size={16} />
              </button>
              
              {showSortDropdown && (
                <div className="absolute top-full mt-1 bg-green-300 rounded-lg shadow-lg overflow-hidden z-10 min-w-[200px]">
                  {[
                    { value: 'featured', icon: TrendingUp },
                    { value: 'newest', icon: Clock },
                    { value: 'viewers', icon: Eye }
                  ].map(({ value, icon: Icon }) => (
                    <button
                      key={value}
                      className="w-full px-4 py-2 text-black hover:bg-white/90 flex items-center justify-between"
                      onClick={() => {
                        setSortBy(value as typeof sortBy);
                        setShowSortDropdown(false);
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <Icon size={16} />
                        <span>sort: {value}</span>
                      </div>
                      {sortBy === value && <Check size={16} className="text-black" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stream Grid */}
          <div className="w-full flex">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-5xl">
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
      </div>
    </div>
  );
}
