import React from 'react';
import Image from 'next/image';
import { Eye, EyeOff } from 'lucide-react';
import type { Stream } from '@/types/stream';

interface StreamTileProps {
  stream: Stream;
  onClick: () => void;
}

const StreamTile: React.FC<StreamTileProps> = ({ stream, onClick }) => {
  const hasPreview = Boolean(stream.previewUrl && !stream.previewError);
  const defaultThumbnail = "/api/placeholder/400/300"; // Fallback thumbnail
  
  return (
    <div 
      className="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer"
      onClick={onClick}
    >
      <div className="relative w-full h-48">
        {hasPreview ? (
          // Live preview
          <Image
            src={stream.previewUrl || defaultThumbnail}
            alt={`${stream.title} preview`}
            fill
            className="object-cover"
          />
        ) : stream.previewError ? (
          // Error state
          <div className="w-full h-full bg-gray-900 flex flex-col items-center justify-center text-gray-500">
            <EyeOff size={24} className="mb-2" />
            <span className="text-sm">Preview Unavailable</span>
          </div>
        ) : (
          // Default thumbnail
          <Image
            src={stream.thumbnail || defaultThumbnail}
            alt={stream.title}
            fill
            className="object-cover"
          />
        )}
        
        {/* Live indicator */}
        {hasPreview && (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
            LIVE
          </div>
        )}
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
