// src/lib/StreamStore.ts

import React from 'react';
import { create } from 'zustand';
import { socketService } from './socketService';
import { sessionManager } from './sessionManager';
import { Stream } from '@/types/stream';

interface StreamMetadata {
  lastUpdated: number;
  syncStatus: 'synced' | 'pending' | 'error';
  error?: string;
}

type UserRole = 'host' | 'viewer' | null;

interface StreamState {
  streams: Map<string, Stream>;
  metadata: Map<string, StreamMetadata>;
  activeStreams: Set<string>;
  isInitialized: boolean;
  userRoles: Map<string, UserRole>; // Maps streamId to user's role in that stream
  
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
  
  // State synchronization
  initializeStore: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
  
  // Stream actions - these now only trigger socket events
  startStream: (streamData: Omit<Stream, 'id'>) => Promise<string>;
  endStream: (id: string) => void;
  updateViewerCount: (id: string, count: number) => void;
  updatePreview: (id: string, previewUrl: string) => void;
  
  // Internal state handlers - called by socket events
  _handleStreamStarted: (stream: Stream) => void;
  _handleStreamEnded: (id: string) => void;
  _handleViewerCountUpdated: (id: string, count: number) => void;
  _handlePreviewUpdated: (id: string, previewUrl: string) => void;
  _handleError: (id: string, error: string) => void;
  
  // New method to handle actual broadcast when going live
  broadcastStream: (streamId: string) => Promise<string>;
}

const useStreamStore = create<StreamState>()((set, get) => ({
  streams: new Map(),
  metadata: new Map(),
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

  getUserRole: (streamId) => {
    return get().userRoles.get(streamId) || null;
  },

  setUserRole: (streamId, role) => {
    set(state => {
      const newRoles = new Map(state.userRoles);
      if (role === null) {
        newRoles.delete(streamId);
      } else {
        newRoles.set(streamId, role);
      }
      return { userRoles: newRoles };
    });
  },

  getHostedStreams: () => {
    const state = get();
    return Array.from(state.streams.values()).filter(stream => 
      state.userRoles.get(stream.id) === 'host' || stream.creator === sessionManager.getUserId()
    );
  },

  // State synchronization
  initializeStore: async () => {
    try {
      // First connect socket
      await socketService.connect();
      
      // Then sync with backend
      await get().syncWithBackend();
      
      try {
        // Now set up socket listeners
        socketService.onStreamStarted((stream) => get()._handleStreamStarted(stream));
        socketService.onStreamEnded((id) => get()._handleStreamEnded(id));
        socketService.onViewerCountUpdated(({ streamId, count }) => 
          get()._handleViewerCountUpdated(streamId, count)
        );
        socketService.onPreviewUpdated(({ streamId, previewUrl }) => 
          get()._handlePreviewUpdated(streamId, previewUrl)
        );
        socketService.onError((error) => 
          console.error('Socket error:', error)
        );
      } catch (error) {
        console.error('Failed to set up socket listeners:', error);
        throw error;
      }

      set({ isInitialized: true });
    } catch (error) {
      console.error('Failed to initialize store:', error);
      throw error;
    }
  },

  syncWithBackend: async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/streams`
      );
      if (!response.ok) throw new Error('Failed to fetch streams');
      
      const streams: Stream[] = await response.json();
      const now = Date.now();

      set(state => {
        const newStreams = new Map(state.streams);
        const newMetadata = new Map(state.metadata);
        const newActiveStreams = new Set<string>();

        streams.forEach(stream => {
          newStreams.set(stream.id, stream);
          newMetadata.set(stream.id, {
            lastUpdated: now,
            syncStatus: 'synced'
          });
          newActiveStreams.add(stream.id);
        });

        return {
          streams: newStreams,
          metadata: newMetadata,
          activeStreams: newActiveStreams
        };
      });
    } catch (error) {
      console.error('Backend sync failed:', error);
      throw error;
    }
  },

  // Stream actions
  startStream: async (streamData) => {
    const streamId = `stream-${crypto.randomUUID()}`;
    
    // Set role immediately for local state
    get().setUserRole(streamId, 'host');

    // Store the stream in local state
    get()._handleStreamStarted({
      ...streamData,
      id: streamId,
      viewers: 0,
      previewUrl: '',
      previewLastUpdated: Date.now(),
      previewError: false
    });

    // Don't emit socket event or set up listeners yet - this will be done when actually going live
    return Promise.resolve(streamId);
  },

  endStream: (id) => {
    socketService.endStream(id);
  },

  updateViewerCount: (id, count) => {
    socketService.updateViewerCount(id, count);
  },

  updatePreview: (id, previewUrl) => {
    socketService.updatePreview(id, previewUrl);
  },

  // Internal state handlers
  _handleStreamStarted: (stream) => {
    set(state => {
      const newStreams = new Map(state.streams);
      const newMetadata = new Map(state.metadata);
      const newActiveStreams = new Set(state.activeStreams);

      newStreams.set(stream.id, stream);
      newMetadata.set(stream.id, {
        lastUpdated: Date.now(),
        syncStatus: 'synced'
      });
      newActiveStreams.add(stream.id);

      return {
        streams: newStreams,
        metadata: newMetadata,
        activeStreams: newActiveStreams
      };
    });
  },

  _handleStreamEnded: (id) => {
    set(state => {
      const newStreams = new Map(state.streams);
      const newMetadata = new Map(state.metadata);
      const newActiveStreams = new Set(state.activeStreams);
      const newUserRoles = new Map(state.userRoles);

      newStreams.delete(id);
      newMetadata.delete(id);
      newActiveStreams.delete(id);
      newUserRoles.delete(id);

      return {
        streams: newStreams,
        metadata: newMetadata,
        activeStreams: newActiveStreams,
        userRoles: newUserRoles
      };
    });
  },

  _handleViewerCountUpdated: (id, count) => {
    set(state => {
      const newStreams = new Map(state.streams);
      const stream = newStreams.get(id);
      
      if (stream) {
        newStreams.set(id, { ...stream, viewers: count });
        return { streams: newStreams };
      }
      return state;
    });
  },

  _handlePreviewUpdated: (id, previewUrl) => {
    set(state => {
      const newStreams = new Map(state.streams);
      const stream = newStreams.get(id);
      
      if (stream) {
        newStreams.set(id, { 
          ...stream, 
          previewUrl,
          previewLastUpdated: Date.now(),
          previewError: false
        });
        return { streams: newStreams };
      }
      return state;
    });
  },

  _handleError: (id, error) => {
    set(state => {
      const newMetadata = new Map(state.metadata);
      const streamMetadata = newMetadata.get(id);
      
      if (streamMetadata) {
        newMetadata.set(id, {
          ...streamMetadata,
          syncStatus: 'error',
          error
        });
        return { metadata: newMetadata };
      }
      return state;
    });
  },

  // New method to handle actual broadcast when going live
  broadcastStream: async (streamId: string) => {
    const stream = get().getStream(streamId);
    if (!stream) {
      throw new Error('Stream not found');
    }

    // Return a promise that resolves when the stream is confirmed started
    return new Promise<string>((resolve, reject) => {
      // Set up a one-time listener for stream start confirmation
      const onStreamStarted = (confirmedStream: Stream) => {
        if (confirmedStream.id === streamId) {
          // Clean up listener
          socketService.onStreamStarted(onStreamStarted);
          resolve(streamId);
        }
      };

      // Set up a one-time error listener
      const onError = (error: { message: string }) => {
        if (error.message.includes(streamId)) {
          // Clean up listeners
          socketService.onStreamStarted(onStreamStarted);
          socketService.onError(onError);
          reject(new Error(error.message));
        }
      };

      // Add listeners
      socketService.onStreamStarted(onStreamStarted);
      socketService.onError(onError);

      // Emit socket event to actually start broadcasting
      socketService.startStream(stream);

      // Set up timeout to prevent hanging
      setTimeout(() => {
        // Clean up listeners
        socketService.onStreamStarted(onStreamStarted);
        socketService.onError(onError);
        reject(new Error('Stream broadcast timed out'));
      }, 10000); // 10 second timeout
    });
  }
}));

// Export a wrapper that ensures initialization
export const useInitializedStreamStore = () => {
  const store = useStreamStore();
  
  React.useEffect(() => {
    if (!store.isInitialized) {
      store.initializeStore().catch(console.error);
    }
  }, [store, store.isInitialized]);

  return store;
};

export { useStreamStore };
