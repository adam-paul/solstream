'use client'

import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useStreamStore } from '@/lib/StreamStore';
import { truncateWalletAddress, getWalletColor } from '@/lib/walletUtils';

interface ChatWindowProps {
  streamId: string;
  isHost?: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ streamId }) => {
  const { messages } = useStreamStore();
  const streamMessages = useStreamStore(state => state.messages.get(streamId) || []);
  const { connected, publicKey } = useWallet();
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendChatMessage, requestChatHistory } = useStreamStore();
  
  // Request chat history when component mounts
  useEffect(() => {
    requestChatHistory(streamId);
  }, [streamId, requestChatHistory]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !messageInput.trim() || !publicKey) return;

    sendChatMessage(streamId, messageInput.trim());
    setMessageInput('');
  };

  const handleReply = (username: string) => {
    setMessageInput(prev => `@${username} ${prev}`);
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg">
      {/* Messages Container */}
      <div className="h-[300px] overflow-y-auto p-4 space-y-2">
        {streamMessages.map((message, index) => (
          <div 
            key={`${message.timestamp}-${index}`}
            className="group flex items-start gap-2 hover:bg-gray-800/50 p-1 rounded"
          >
            <span className="text-gray-500 text-sm">
              {formatTimestamp(message.timestamp)}
            </span>
            <span 
              style={{ color: getWalletColor(message.username) }}
              className="font-medium"
            >
              {truncateWalletAddress(message.username)}
            </span>
            <span className="text-white break-words flex-1">
              {message.content}
            </span>
            <button
              onClick={() => handleReply(message.username)}
              className="text-gray-500 hover:text-gray-300 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >
              [reply]
            </button>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form 
        onSubmit={handleSendMessage}
        className="border-t border-gray-800 p-4"
      >
        {connected ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="type a message..."
              className="flex-1 bg-gray-800 text-white rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!messageInput.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              send
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-500">
            connect wallet to chat
          </div>
        )}
      </form>
    </div>
  );
};

export default ChatWindow;

