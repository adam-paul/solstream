// src/lib/StreamStore.ts

import { create } from 'zustand';
import { socketService } from './socketService';
import { sessionManager } from './sessionManager';
import { Stream } from '@/types/stream';

type UserRole = 'host' | 'viewer' | null;

interface StreamState {
  streams: Stream[];
  activeStreams: Set<string>;
  currentUserRole: UserRole;
  userHostedStreams: Set<string>;
  
  // Role management
  setUserRole: (streamId: string, role: UserRole) => void;
  isStreamHost: (streamId: string) => boolean;
  
  // Stream management
  addStream: (streamData: Omit<Stream, 'id'>) => Stream;
  removeStream: (id: string) => void;
  updateViewerCount: (id: string, count: number) => void;
  getStream: (id: string) => Stream | undefined;
  startStream: (id: string) => void;
  endStream: (id: string) => void;
  isStreamActive: (id: string) => boolean;
  initializeWebSocket: () => void;
}

// Initialized flag to prevent multiple initializations
let isWebSocketInitialized = false;

const createStore = () => 
  create<StreamState>((set, get) => ({
    streams: [],
    activeStreams: new Set(),
    currentUserRole: null,
    userHostedStreams: new Set(),

    setUserRole: (streamId: string, role: UserRole) => {
      set((state) => {
        const newHostedStreams = new Set(state.userHostedStreams);
        if (role === 'host') {
          newHostedStreams.add(streamId);
        } else {
          newHostedStreams.delete(streamId);
        }
        return {
          currentUserRole: role,
          userHostedStreams: newHostedStreams,
        };
      });
    },

    isStreamHost: (streamId: string) => {
      const stream = get().streams.find(s => s.id === streamId);
      const currentUserId = sessionManager.getUserId();
      return stream?.creator === currentUserId;
    },

    addStream: (streamData: Omit<Stream, 'id'>) => {
      const newStream = {
        ...streamData,
        id: `stream-${crypto.randomUUID()}`
      };

      set((state) => ({
        streams: [...state.streams, newStream],
        userHostedStreams: new Set(state.userHostedStreams).add(newStream.id)
      }));

      return newStream;
    },

    removeStream: (id: string) => {
      socketService.endStream(id);
      set((state) => ({
        streams: state.streams.filter(stream => stream.id !== id),
        activeStreams: new Set([...state.activeStreams].filter(streamId => streamId !== id)),
        userHostedStreams: new Set([...state.userHostedStreams].filter(streamId => streamId !== id))
      }));
    },

    updateViewerCount: (id: string, count: number) => {
      socketService.updateViewerCount(id, count);
      set((state) => ({
        streams: state.streams.map(stream =>
          stream.id === id ? { ...stream, viewers: count } : stream
        ),
      }));
    },

    getStream: (id: string) => get().streams.find(s => s.id === id),
    
    startStream: (id: string) => {
      const stream = get().getStream(id);
      if (stream) {
        socketService.startStream(stream);
        set((state) => ({
          activeStreams: new Set(state.activeStreams).add(id),
          userHostedStreams: new Set(state.userHostedStreams).add(id)
        }));
      }
    },
    
    endStream: (id: string) => {
      socketService.endStream(id);
      set((state) => {
        const newActiveStreams = new Set(state.activeStreams);
        const newHostedStreams = new Set(state.userHostedStreams);
        newActiveStreams.delete(id);
        newHostedStreams.delete(id);
        return {
          activeStreams: newActiveStreams,
          userHostedStreams: newHostedStreams,
          streams: state.streams.filter(s => s.id !== id)
        };
      });
    },
    
    isStreamActive: (id: string) => get().activeStreams.has(id),

    initializeWebSocket: () => {
      if (isWebSocketInitialized) {
        return;
      }
      
      try {
        const socket = socketService.connect();
        
        socket.on('connect', async () => {
          try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/streams`);
            const streams = await response.json();
            set({ 
              streams,
              activeStreams: new Set(streams.map((s: Stream) => s.id))
            });
          } catch (error) {
            console.error('Error fetching initial streams:', error);
          }
        });
        
        socketService.onStreamStarted((stream) => {
          set((state) => {
            if (state.streams.some(s => s.id === stream.id)) {
              return state;
            }
            return {
              streams: [...state.streams, stream],
              activeStreams: new Set(state.activeStreams).add(stream.id)
            };
          });
        });

        socketService.onStreamEnded((streamId) => {
          set((state) => ({
            streams: state.streams.filter(s => s.id !== streamId),
            activeStreams: new Set([...state.activeStreams].filter(id => id !== streamId)),
            userHostedStreams: new Set([...state.userHostedStreams].filter(id => id !== streamId))
          }));
        });

        socketService.onViewerCountUpdated(({ streamId, count }) => {
          set((state) => ({
            streams: state.streams.map(stream =>
              stream.id === streamId ? { ...stream, viewers: count } : stream
            )
          }));
        });

        socketService.onPreviewUpdated(({ streamId, previewUrl }) => {
          set((state) => ({
            streams: state.streams.map(stream =>
              stream.id === streamId ? { ...stream, previewUrl, previewError: false } : stream
            )
          }));
        });

        isWebSocketInitialized = true;
      } catch (error) {
        console.error('Error initializing WebSocket:', error);
        isWebSocketInitialized = false;
      }
    },
  }));

let store: ReturnType<typeof createStore> | undefined;

export const useStreamStore = () => {
  if (typeof window === 'undefined') {
    return createStore();
  }
  
  if (!store) {
    store = createStore();
  }
  return store;
};
