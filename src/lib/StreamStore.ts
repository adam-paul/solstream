// src/lib/StreamStore.ts

import React from 'react';
import { create } from 'zustand';
import { socketService } from './socketService';
import { sessionManager } from './sessionManager';
import { Stream } from '@/types/stream';

type UserRole = 'host' | 'viewer' | null;

interface StreamState {
  streams: Map<string, Stream>;
  activeStreams: Set<string>;
  userRoles: Map<string, UserRole>;
  isInitialized: boolean;
  
  // Core state accessors
  getStream: (id: string) => Stream | undefined;
  getAllStreams: () => Stream[];
  getActiveStreams: () => Stream[];
  isStreamActive: (id: string) => boolean;
  isStreamHost: (streamId: string) => boolean;
  
  // Role management
  getUserRole: (streamId: string) => UserRole;
  setUserRole: (streamId: string, role: UserRole) => void;
  getHostedStreams: () => Stream[];
  
  // Store initialization
  initializeStore: () => Promise<void>;
  
  // Stream actions
  startStream: (streamData: Omit<Stream, 'id'>) => Promise<string>;
  endStream: (id: string) => void;
  updatePreview: (id: string, previewUrl: string) => void;
}

const useStreamStore = create<StreamState>()((set, get) => ({
  streams: new Map(),
  activeStreams: new Set(),
  userRoles: new Map(),
  isInitialized: false,

  // Core state accessors
  getStream: (id) => get().streams.get(id),
  
  getAllStreams: () => Array.from(get().streams.values()),
  
  getActiveStreams: () => (
    Array.from(get().activeStreams)
      .map(id => get().streams.get(id))
      .filter((stream): stream is Stream => stream !== undefined)
  ),
  
  isStreamActive: (id) => get().activeStreams.has(id),
  
  isStreamHost: (streamId) => {
    const stream = get().streams.get(streamId);
    return stream ? stream.creator === sessionManager.getUserId() : false;
  },

  // Role management
  getUserRole: (streamId) => get().userRoles.get(streamId) || null,

  setUserRole: (streamId, role) => set(state => {
    const newRoles = new Map(state.userRoles);
    if (role === null) {
      newRoles.delete(streamId);
    } else {
      newRoles.set(streamId, role);
    }
    return { userRoles: newRoles };
  }),

  getHostedStreams: () => {
    const state = get();
    return Array.from(state.streams.values()).filter(stream => 
      state.userRoles.get(stream.id) === 'host' || stream.creator === sessionManager.getUserId()
    );
  },

  // Store initialization
  initializeStore: async () => {
    try {
      await socketService.connect();
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/streams`
      );
      if (!response.ok) throw new Error('Failed to fetch streams');
      
      const streams: Stream[] = await response.json();

      // Set up socket listeners
      socketService.onStreamStarted((stream) => {
        set(state => {
          const newStreams = new Map(state.streams);
          const newActiveStreams = new Set(state.activeStreams);
          newStreams.set(stream.id, stream);
          newActiveStreams.add(stream.id);
          return { streams: newStreams, activeStreams: newActiveStreams };
        });
      });

      socketService.onStreamEnded((id) => {
        set(state => {
          const newStreams = new Map(state.streams);
          const newActiveStreams = new Set(state.activeStreams);
          const newUserRoles = new Map(state.userRoles);
          newStreams.delete(id);
          newActiveStreams.delete(id);
          newUserRoles.delete(id);
          return { 
            streams: newStreams, 
            activeStreams: newActiveStreams,
            userRoles: newUserRoles 
          };
        });
      });

      // Handle viewer count updates through join/leave events
      socketService.onViewerJoined(({ streamId, count }) => {
        set(state => {
          const newStreams = new Map(state.streams);
          const stream = newStreams.get(streamId);
          if (stream) {
            newStreams.set(streamId, { ...stream, viewers: count });
            return { streams: newStreams };
          }
          return state;
        });
      });

      socketService.onViewerLeft(({ streamId, count }) => {
        set(state => {
          const newStreams = new Map(state.streams);
          const stream = newStreams.get(streamId);
          if (stream) {
            newStreams.set(streamId, { ...stream, viewers: count });
            return { streams: newStreams };
          }
          return state;
        });
      });

      socketService.onPreviewUpdated(({ streamId, previewUrl }) => {
        set(state => {
          const newStreams = new Map(state.streams);
          const stream = newStreams.get(streamId);
          if (stream) {
            newStreams.set(streamId, { 
              ...stream, 
              previewUrl
            });
            return { streams: newStreams };
          }
          return state;
        });
      });

      // Initialize state with fetched streams
      set(state => {
        const newStreams = new Map(state.streams);
        const newActiveStreams = new Set<string>();

        streams.forEach(stream => {
          newStreams.set(stream.id, stream);
          newActiveStreams.add(stream.id);
        });

        return {
          streams: newStreams,
          activeStreams: newActiveStreams,
          isInitialized: true
        };
      });
    } catch (error) {
      throw error;
    }
  },

  // Stream actions
  startStream: async (streamData) => {
    const streamId = `stream-${crypto.randomUUID()}`;
    get().setUserRole(streamId, 'host');
  
    try {
      const newStream: Stream = {
        ...streamData,
        id: streamId,
        viewers: 0,
        previewUrl: undefined
      };

      socketService.startStream(newStream);
      return streamId;
    } catch (error) {
      get().setUserRole(streamId, null);
      throw error;
    }
  },

  endStream: (id) => {
    socketService.endStream(id);
  },

  updatePreview: (id, previewUrl) => {
    socketService.updatePreview(id, previewUrl);
  }
}));

export const useInitializedStreamStore = () => {
  const store = useStreamStore();
  
  React.useEffect(() => {
    if (!store.streams.size) {
      store.initializeStore().catch(console.error);
    }
  }, [store]);

  return store;
};

export { useStreamStore };
