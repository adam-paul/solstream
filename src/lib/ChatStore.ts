// ChatStore.ts
import { create } from 'zustand';
import { socketService } from './socketService';
import { ChatMessage } from '@/types/stream';

interface ChatState {
  messages: Map<string, ChatMessage[]>;
  getMessages: (streamId: string) => ChatMessage[];
  sendChatMessage: (streamId: string, content: string) => void;
  initializeStore: () => Promise<void>;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: new Map(),

  getMessages: (streamId) => {
    return get().messages.get(streamId) ?? [];
  },

  sendChatMessage: (streamId, content) => {
    console.log('[ChatStore] Sending message to:', streamId);
    socketService.sendChatMessage({ streamId, content });
  },

  initializeStore: async () => {
    try {
      console.log('[ChatStore] Initializing socket connection...');
      await socketService.connect();
      
      // Set up our message listeners
      socketService.onChatMessageReceived(({ streamId, message }) => {
        console.log('[ChatStore] Received new message for stream:', streamId);
        set(state => {
          const newMessages = new Map(state.messages);
          const streamMessages = newMessages.get(streamId) ?? [];
          newMessages.set(streamId, [...streamMessages, message]);
          return { messages: newMessages };
        });
      });

      socketService.onChatHistoryReceived(({ streamId, messages }) => {
        console.log('[ChatStore] Received message history for stream:', streamId);
        set(state => {
          const newMessages = new Map(state.messages);
          newMessages.set(streamId, messages);
          return { messages: newMessages };
        });
      });

    } catch (error) {
      console.error('[ChatStore] Failed to initialize:', error);
      throw error;
    }
  }
}));
