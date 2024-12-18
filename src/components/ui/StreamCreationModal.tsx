// src/components/ui/StreamCreationModal.tsx
'use client'

import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { useInitializedStreamStore } from '@/lib/StreamStore';
import { sessionManager } from '@/lib/sessionManager';
import { createStream } from '@/lib/streamFactory';

interface StreamCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStreamCreated: (streamId: string) => void;
}

const StreamCreationModal: React.FC<StreamCreationModalProps> = ({
  isOpen,
  onClose,
  onStreamCreated,
}) => {
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ticker, setTicker] = useState('');
  const [coinAddress, setCoinAddress] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [twitterLink, setTwitterLink] = useState('');
  const [telegramLink, setTelegramLink] = useState('');
  const [website, setWebsite] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { startStream } = useInitializedStreamStore();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Generate stream ID
      const streamId = `stream-${crypto.randomUUID()}`;
      
      // Create the stream data
      const streamData = {
        ...createStream({
          title,
          ticker,
          coinAddress,
        }, sessionManager.getUserId()),
        id: streamId,
        description: description || undefined
      };

      // Initiate stream creation through StreamStore
      startStream(streamData);
      
      // Reset form
      setTitle('');
      setDescription('');
      setTicker('');
      setCoinAddress('');
      setSelectedImage(null);
      setTwitterLink('');
      setTelegramLink('');
      setWebsite('');
      setShowMoreOptions(false);

      // Notify parent of successful creation
      onStreamCreated(streamId);
    } catch (error) {
      console.error('Failed to create stream:', error);
      // Note: Error handling is managed by StreamStore
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedImage(e.target.files[0]);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-gray-900 w-[90%] h-[90%] rounded-lg p-8 overflow-y-auto">
        {/* Back Button */}
        <button 
          onClick={onClose}
          className="text-blue-400 hover:text-blue-300 text-xl mb-8 w-full text-center"
        >
          [go back]
        </button>

        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
          {/* Stream Title */}
          <div className="space-y-2">
            <label className="text-blue-400 block">stream title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-800 rounded p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Ticker */}
          <div className="space-y-2">
            <label className="text-blue-400 block">ticker</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">$</span>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="w-full bg-gray-800 rounded p-3 pl-8 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Coin Address */}
          <div className="space-y-2">
            <label className="text-blue-400 block">coin address</label>
            <input
              type="text"
              value={coinAddress}
              onChange={(e) => setCoinAddress(e.target.value)}
              className="w-full bg-gray-800 rounded p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-blue-400 block">description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-800 rounded p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-32"
            />
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <label className="text-blue-400 block">image</label>
            <div 
              className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
              />
              <Upload className="mx-auto mb-2" size={24} />
              <p className="text-gray-400">
                {selectedImage ? selectedImage.name : 'drag and drop an image'}
              </p>
              <button
                type="button"
                className="mt-2 px-4 py-2 border border-gray-700 rounded-lg text-sm"
              >
                select file
              </button>
            </div>
          </div>

          {/* Show More Options */}
          <button
            type="button"
            onClick={() => setShowMoreOptions(!showMoreOptions)}
            className="text-blue-400 hover:text-blue-300"
          >
            {showMoreOptions ? 'hide more options ↑' : 'show more options ↓'}
          </button>

          {/* Additional Options */}
          {showMoreOptions && (
            <div className="space-y-6">
              {/* Twitter Link */}
              <div className="space-y-2">
                <label className="text-blue-400 block">twitter link</label>
                <input
                  type="text"
                  value={twitterLink}
                  onChange={(e) => setTwitterLink(e.target.value)}
                  placeholder="(optional)"
                  className="w-full bg-gray-800 rounded p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Telegram Link */}
              <div className="space-y-2">
                <label className="text-blue-400 block">telegram link</label>
                <input
                  type="text"
                  value={telegramLink}
                  onChange={(e) => setTelegramLink(e.target.value)}
                  placeholder="(optional)"
                  className="w-full bg-gray-800 rounded p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Website */}
              <div className="space-y-2">
                <label className="text-blue-400 block">website</label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="(optional)"
                  className="w-full bg-gray-800 rounded p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Launch Button */}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg mt-8"
          >
            launch stream
          </button>

          {/* Fee Notice */}
          <p className="text-center text-sm text-gray-400 mt-4">
            launching a stream requires a 0.05 SOL fee
          </p>
        </form>
      </div>
    </div>
  );
};

export default StreamCreationModal;