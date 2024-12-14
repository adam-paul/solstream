'use client'

import React, { useState } from 'react';
import Image from 'next/image';
import { Search, TrendingUp, Clock, Eye } from 'lucide-react';
import StreamComponent from './StreamComponent';
import StreamCreationModal from './StreamCreationModal';
import StreamTile from './StreamTile';
import StreamViewer from './StreamViewer';
import { useStreamStore, type Stream } from '@/lib/StreamStore';

// Mock activity data (keeping this separate as it's not part of streams)
const mockActivity = [
  "🎥 NewStream launched for $SOL",
  "👀 Trading101 just hit 1000 viewers",
  "🚀 Technical Analysis stream starting for $BONK"
];

const SolstreamUI: React.FC = () => {
  const [sortBy, setSortBy] = useState<'featured' | 'newest' | 'viewers'>('featured');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [showStreamModal, setShowStreamModal] = useState<boolean>(false);
    const [selectedStream, setSelectedStream] = useState<Stream | null>(null);
  const [streamData, setStreamData] = useState({
    title: '',
    description: '',
    ticker: ''
  });

  const { streams } = useStreamStore();

  const startStream = (title: string, description: string, ticker: string) => {
    setStreamData({ title, description, ticker });
    setShowStreamModal(false);
    setIsStreaming(true);
  };

  const endStream = () => {
    setIsStreaming(false);
  };

  const handleStreamClick = (streamId: string | number) => {
    const stream = streams.find(s => s.id === streamId);
    if (stream) {
      setSelectedStream(stream);
    }
  };

  // Sort streams based on selected criteria
  const sortedStreams = [...streams].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return b.createdAt.localeCompare(a.createdAt);
      case 'viewers':
        return b.viewers - a.viewers;
      default:
        return 0;
    }
  });

  // Filter streams based on search query
  const filteredStreams = sortedStreams.filter(stream =>
    stream.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stream.creator.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header Ticker */}
      <div className="bg-yellow-400 text-black p-2 rounded-lg mb-6 overflow-hidden">
        <div className="flex space-x-8 animate-scroll">
          {mockActivity.map((activity, index) => (
            <span key={index} className="whitespace-nowrap">{activity}</span>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto">
        {/* New Stream Button */}
        <div className="text-center mb-8">
          <button 
            onClick={() => setShowStreamModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg"
          >
            start a new stream
          </button>
        </div>

        {/* Stream Creation Modal */}
        <StreamCreationModal
          isOpen={showStreamModal}
          onClose={() => setShowStreamModal(false)}
          onStartStream={startStream}
        />

        {/* Active Stream Component */}
        {isStreaming && (
          <StreamComponent
            onClose={endStream}
            title={streamData.title}
            description={streamData.description}
            ticker={streamData.ticker}
          />
        )}

        {/* Featured Stream */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-yellow-400">Current Top Stream</h2>
          <div className="flex items-center space-x-4">
            <div className="relative w-16 h-16">
              <Image
                src="/api/placeholder/100/100"
                alt="Featured Stream"
                fill
                className="rounded-full object-cover"
              />
            </div>
            <div>
              <h3 className="text-xl">Trading Masterclass</h3>
              <p className="text-gray-400">1.2k viewers • Started 2h ago</p>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-8">
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="search streams by token"
                className="w-full bg-gray-800 rounded-lg py-2 px-4 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="absolute right-3 top-2.5 text-gray-400" size={20} />
            </div>
            <button className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg">
              search
            </button>
          </div>
        </div>

        {/* Sort Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-gray-400">sort:</span>
          <div className="flex flex-wrap gap-2">
            <button
              className={`px-4 py-2 rounded-lg ${
                sortBy === 'featured' ? 'bg-green-500' : 'bg-gray-800'
              }`}
              onClick={() => setSortBy('featured')}
            >
              <TrendingUp className="inline-block mr-2" size={16} />
              featured
            </button>
            <button
              className={`px-4 py-2 rounded-lg ${
                sortBy === 'newest' ? 'bg-green-500' : 'bg-gray-800'
              }`}
              onClick={() => setSortBy('newest')}
            >
              <Clock className="inline-block mr-2" size={16} />
              newest
            </button>
            <button
              className={`px-4 py-2 rounded-lg ${
                sortBy === 'viewers' ? 'bg-green-500' : 'bg-gray-800'
              }`}
              onClick={() => setSortBy('viewers')}
            >
              <Eye className="inline-block mr-2" size={16} />
              most viewers
            </button>
          </div>
        </div>

        {/* Streams Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredStreams.map((stream) => (
            <StreamTile
              key={stream.id}
              stream={stream}
              onClick={() => handleStreamClick(stream.id)}
            />
          ))}
        </div>

        {/* Stream Viewer */}
        {selectedStream && (
          <StreamViewer
            stream={selectedStream}
            onClose={() => setSelectedStream(null)}
          />
        )}
      </div>
    </div>
  );
};

export default SolstreamUI;