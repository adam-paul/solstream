'use client'

import React, { useState } from 'react';
import { Search, TrendingUp, Clock, Eye } from 'lucide-react';

// Mock data for demonstration
const mockStreams = [
  {
    id: 1,
    title: "SOL Trading Analysis",
    creator: "CryptoExpert",
    createdAt: "1m ago",
    marketCap: "$48.4K",
    viewers: 156,
    thumbnail: "/api/placeholder/400/300"
  },
  // Add more mock streams as needed
];

const mockActivity = [
  "🎥 NewStream launched for $SOL",
  "👀 Trading101 just hit 1000 viewers",
  "🚀 Technical Analysis stream starting for $BONK"
];

const SolstreamUI = () => {
  const [sortBy, setSortBy] = useState('featured');
  const [searchQuery, setSearchQuery] = useState('');

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
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg">
            [start a new stream]
          </button>
        </div>

        {/* Featured Stream */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-yellow-400">Current Top Stream</h2>
          <div className="flex items-center space-x-4">
            <img src="/api/placeholder/100/100" alt="Featured Stream" className="w-16 h-16 rounded-full" />
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
          {mockStreams.map((stream) => (
            <div key={stream.id} className="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all">
              <img src={stream.thumbnail} alt={stream.title} className="w-full h-48 object-cover" />
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold">{stream.title}</h3>
                  <span className="text-green-400">{stream.marketCap}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{stream.creator}</span>
                  <span>{stream.viewers} viewers</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SolstreamUI;