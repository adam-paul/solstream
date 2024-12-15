'use client'

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, TrendingUp, Clock, Eye } from 'lucide-react';
import StreamCreationModal from './StreamCreationModal';
import StreamTile from './StreamTile';
import { useStreamStore } from '@/lib/StreamStore';

// Mock activity data
const mockActivity = [
  "🎥 NewStream launched for $SOL",
  "👀 Trading101 just hit 1000 viewers",
  "🚀 Technical Analysis stream starting for $BONK"
];

const SolstreamUI: React.FC = () => {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<'featured' | 'newest' | 'viewers'>('featured');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showStreamModal, setShowStreamModal] = useState<boolean>(false);

  // Get store methods
  const store = useStreamStore();
  const streams = store((state) => state.streams);
  const addStream = store((state) => state.addStream);
  const startStream = store((state) => state.startStream);
  const isStreamActive = store((state) => state.isStreamActive);
  
  const handleStartStream = (title: string, description: string, ticker: string) => {
    const streamData = {
      title,
      description,
      ticker,
      creator: 'Current User', // In a real app, this would come from auth
      marketCap: '0',
      thumbnail: "/api/placeholder/400/300"
    };
    
    const newStream = addStream(streamData);
    startStream(newStream.id);  // Mark the stream as active
    setShowStreamModal(false);
    router.push(`/stream/${newStream.id}`);  // Redirect to stream page
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
        return 0; // 'featured' maintains original order
    }
  });

  // Filter streams based on search query and active status
  const filteredStreams = sortedStreams
    .filter(stream => isStreamActive(stream.id))  // Only show active streams
    .filter(stream =>
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
          onStartStream={handleStartStream}
        />

        {/* Featured Stream */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-yellow-400">Current Top Stream</h2>
          {featuredStream ? (
            <div 
              className="flex items-center space-x-4 cursor-pointer"
              onClick={() => handleStreamSelect(featuredStream.id)}
            >
              <div className="relative w-16 h-16 bg-gray-700 rounded-full overflow-hidden">
                <img
                  src={featuredStream.thumbnail}
                  alt={featuredStream.title}
                  className="object-cover w-full h-full"
                />
              </div>
              <div>
                <h3 className="text-xl">{featuredStream.title}</h3>
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
          </div>
        </div>

        {/* Sort Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-gray-400">sort:</span>
          <div className="flex flex-wrap gap-2">
            <button
              className={`px-4 py-2 rounded-lg flex items-center ${
                sortBy === 'featured' ? 'bg-green-500' : 'bg-gray-800'
              }`}
              onClick={() => setSortBy('featured')}
            >
              <TrendingUp className="mr-2" size={16} />
              featured
            </button>
            <button
              className={`px-4 py-2 rounded-lg flex items-center ${
                sortBy === 'newest' ? 'bg-green-500' : 'bg-gray-800'
              }`}
              onClick={() => setSortBy('newest')}
            >
              <Clock className="mr-2" size={16} />
              newest
            </button>
            <button
              className={`px-4 py-2 rounded-lg flex items-center ${
                sortBy === 'viewers' ? 'bg-green-500' : 'bg-gray-800'
              }`}
              onClick={() => setSortBy('viewers')}
            >
              <Eye className="mr-2" size={16} />
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
              onClick={() => handleStreamSelect(stream.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SolstreamUI;