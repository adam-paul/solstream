// ChatStore.ts
import { create } from 'zustand';
import { socketService } from './socketService';
import { ChatMessage } from '@/types/stream';

interface ChatState {
  messages: Map<string, ChatMessage[]>;
  cleanupFns: (() => void)[];
  getMessages: (streamId: string) => ChatMessage[];
  sendChatMessage: (streamId: string, content: string, username: string) => void;
  initializeStore: () => Promise<void>;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: new Map(),
  cleanupFns: [],

  getMessages: (streamId) => {
    return get().messages.get(streamId) ?? [];
  },

  sendChatMessage: (streamId, content, username) => {
    console.log('[ChatStore] Sending message to:', streamId);
    socketService.sendChatMessage({ streamId, content, username });
  },

  initializeStore: async () => {
    try {
      // Clean up any existing listeners
      get().cleanupFns.forEach(cleanup => cleanup());

      // Create new array for new cleanup functions
      const newCleanupFns = [];

      // Add cleanup function to our array
      newCleanupFns.push(socketService.onChatMessageReceived(({ streamId, message }) => {
        console.log('[ChatStore] Received new message for stream:', streamId);
        set(state => {
          const newMessages = new Map(state.messages);
          const streamMessages = newMessages.get(streamId) ?? [];
          newMessages.set(streamId, [...streamMessages, message]);
          return { messages: newMessages };
        });
      }));

      newCleanupFns.push(socketService.onChatHistoryReceived(({ streamId, messages }) => {
        console.log('[ChatStore] Received message history for stream:', streamId);
        set(state => {
          const newMessages = new Map(state.messages);
          newMessages.set(streamId, messages);
          return { messages: newMessages };
        });
      }));

      // Update cleanup functions
      set({ cleanupFns: newCleanupFns });

    } catch (error) {
      console.error('[ChatStore] Failed to initialize:', error);
      throw error;
    }
  }
}));
