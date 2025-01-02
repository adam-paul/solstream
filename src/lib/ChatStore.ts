// src/lib/ChatStore.ts

import React from 'react';
import { create } from 'zustand';
import { socketService } from './socketService';
import { ChatMessage } from '@/types/stream';

interface ChatState {
  messages: Map<string, ChatMessage[]>;
  activeRooms: Set<string>;
  isInitialized: boolean;

  // Core state accessors
  getMessages: (streamId: string) => ChatMessage[];
  isInRoom: (streamId: string) => boolean;

  // Chat room actions
  joinChatRoom: (streamId: string) => Promise<void>;
  leaveChatRoom: (streamId: string) => void;
  
  // Chat actions
  sendChatMessage: (streamId: string, content: string) => void;
  requestChatHistory: (streamId: string) => void;

  // Store initialization
  initializeStore: () => Promise<void>;
}

const EMPTY_MESSAGES: ChatMessage[] = [];

const useChatStore = create<ChatState>()((set, get) => ({
  messages: new Map(),
  activeRooms: new Set(),
  isInitialized: false,

  getMessages: (streamId) => {
    return get().messages.get(streamId) ?? EMPTY_MESSAGES;
  },

  isInRoom: (streamId) => {
    return get().activeRooms.has(streamId);
  },

  joinChatRoom: async (streamId) => {
    // Don't rejoin if already in room
    if (get().isInRoom(streamId)) return;

    try {
      socketService.joinChat(streamId);
      
      set(state => ({
        activeRooms: new Set(state.activeRooms).add(streamId)
      }));

      // Request chat history after joining
      get().requestChatHistory(streamId);
    } catch (error) {
      console.error('Failed to join chat room:', error);
      throw error;
    }
  },

  leaveChatRoom: (streamId) => {
    if (!get().isInRoom(streamId)) return;

    socketService.leaveChat(streamId);
    
    set(state => {
      const newRooms = new Set(state.activeRooms);
      newRooms.delete(streamId);
      
      const newMessages = new Map(state.messages);
      newMessages.delete(streamId);
      
      return {
        activeRooms: newRooms,
        messages: newMessages
      };
    });
  },

  sendChatMessage: (streamId, content) => {
    if (!get().isInRoom(streamId)) {
      console.error('Cannot send message: not in chat room');
      return;
    }
    socketService.sendChatMessage({ streamId, content });
  },

  requestChatHistory: (streamId) => {
    if (!get().isInRoom(streamId)) {
      console.error('Cannot request history: not in chat room');
      return;
    }
    socketService.requestChatHistory(streamId);
  },

  initializeStore: async () => {
    try {
      const socket = await socketService.connect();
      
      if (!socket.connected) {
        throw new Error('Socket failed to connect');
      }

      // Set up chat-specific socket listeners
      socketService.onChatJoined(({ streamId }) => {
        console.log(`Successfully joined chat room: ${streamId}`);
      });

      socketService.onChatLeft(({ streamId }) => {
        set(state => {
          const newRooms = new Set(state.activeRooms);
          newRooms.delete(streamId);
          return { activeRooms: newRooms };
        });
      });

      socketService.onChatMessageReceived(({ streamId, message }) => {
        if (!get().isInRoom(streamId)) return;

        set(state => {
          const newMessages = new Map(state.messages);
          const streamMessages = newMessages.get(streamId) ?? [];
          newMessages.set(streamId, [...streamMessages, message]);
          return { messages: newMessages };
        });
      });

      socketService.onChatHistoryReceived(({ streamId, messages }) => {
        if (!get().isInRoom(streamId)) return;

        set(state => {
          const newMessages = new Map(state.messages);
          newMessages.set(streamId, messages);
          return { messages: newMessages };
        });
      });

      set({ isInitialized: true });
    } catch (error) {
      console.error('Failed to initialize chat store:', error);
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
