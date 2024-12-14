import React from 'react';
import Image from 'next/image';
import { Eye } from 'lucide-react';
import type { Stream } from '@/lib/StreamStore';

interface StreamTileProps {
  stream: Stream;
  onClick: () => void;
}

const StreamTile: React.FC<StreamTileProps> = ({ stream, onClick }) => {
  return (
    <div 
      className="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer"
      onClick={onClick}
    >
      <div className="relative w-full h-48">
        <Image
          src={stream.thumbnail}
          alt={stream.title}
          fill
          className="object-cover"
        />
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold">{stream.title}</h3>
          <span className="text-green-400">{stream.marketCap}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-400">
          <span>{stream.creator}</span>
          <div className="flex items-center space-x-2">
            <Eye size={14} />
            <span>{stream.viewers} viewers</span>
          </div>
        </div>
        {stream.description && (
          <p className="text-sm text-gray-400 mt-2 line-clamp-2">
            {stream.description}
          </p>
        )}
      </div>
    </div>
  );
};

export default StreamTile;