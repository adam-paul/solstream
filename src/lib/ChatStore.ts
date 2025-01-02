// src/lib/ChatStore.ts

import React from 'react';
import { create } from 'zustand';
import { socketService } from './socketService';
import { ChatMessage } from '@/types/stream';

interface ChatState {
  messages: Map<string, ChatMessage[]>;
  isInitialized: boolean;

  // Core state accessors
  getMessages: (streamId: string) => ChatMessage[];

  // Chat actions
  sendChatMessage: (streamId: string, content: string) => void;
  requestChatHistory: (streamId: string) => void;

  // Store initialization
  initializeStore: () => Promise<void>;
}

const EMPTY_MESSAGES: ChatMessage[] = [];

const useChatStore = create<ChatState>()((set, get) => ({
  messages: new Map(),
  isInitialized: false,

  getMessages: (streamId) => {
    return get().messages.get(streamId) ?? EMPTY_MESSAGES;
  },

  sendChatMessage: (streamId, content) => {
    socketService.sendChatMessage({ streamId, content });
  },

  requestChatHistory: (streamId) => {
    socketService.requestChatHistory(streamId);
  },

  initializeStore: async () => {
    try {
      const socket = await socketService.connect();
      
      if (!socket.connected) {
        throw new Error('Socket failed to connect');
      }

      // Set up chat-specific socket listeners
      socketService.onChatMessageReceived(({ streamId, message }) => {
        set(state => {
          const newMessages = new Map(state.messages);
          const streamMessages = newMessages.get(streamId) ?? EMPTY_MESSAGES;
          newMessages.set(streamId, [...streamMessages, message]);
          return { messages: newMessages };
        });
      });

      socketService.onChatHistoryReceived(({ streamId, messages }) => {
        set(state => {
          const newMessages = new Map(state.messages);
          newMessages.set(streamId, messages);
          return { messages: newMessages };
        });
      });

      set({ isInitialized: true });
    } catch (error) {
      throw error;
    }
  }
}));

export const useInitializedChatStore = () => {
  const store = useChatStore();
  
  React.useEffect(() => {
    if (!store.isInitialized) {
      store.initializeStore().catch(console.error);
    }
  }, [store]);

  return store;
};

export { useChatStore };

