import { create } from 'zustand';
import { socketService } from './socketService';
import { sessionManager } from './sessionManager';
import { Stream } from '@/types/stream';

type UserRole = 'host' | 'viewer' | null;

interface StreamState {
  streams: Stream[];
  activeStreams: Set<string>;
  currentUserRole: UserRole;
  userHostedStreams: Set<string>;  // Track streams user is hosting
  
  // Role management
  setUserRole: (streamId: string, role: UserRole) => void;
  isStreamHost: (streamId: string) => boolean;
  
  // Existing methods
  addStream: (stream: Omit<Stream, 'id' | 'createdAt' | 'viewers'>) => Stream;
  removeStream: (id: string) => void;
  updateViewerCount: (id: string, count: number) => void;
  getStream: (id: string) => Stream | undefined;
  startStream: (id: string) => void;
  endStream: (id: string) => void;
  isStreamActive: (id: string) => boolean;
  initializeWebSocket: () => void;
}

// Add an initialized flag to prevent multiple initializations
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

    initializeWebSocket: () => {
      if (isWebSocketInitialized) {
        console.log('WebSocket already initialized');
        return;
      }
      
      console.log('Initializing WebSocket connection...');
      
      try {
        const socket = socketService.connect();
        
        // Add a specific handler for stream state sync
        socket.on('connect', async () => {
          console.log('Connected to WebSocket server');
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
        
        // Clean up any existing listeners first
        socketService.removeListener('streamStarted', () => {});
        socketService.removeListener('streamEnded', () => {});
        socketService.removeListener('viewerJoined', () => {});
        socketService.removeListener('viewerLeft', () => {});
        socketService.removeListener('error', () => {});
        
        socketService.onStreamStarted((stream) => {
          console.log('Received new stream:', stream);
          set((state) => {
            // Check if stream already exists
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

        socketService.onViewerJoined(({ streamId, count }) => {
          set((state) => ({
            streams: state.streams.map(stream =>
              stream.id === streamId ? { ...stream, viewers: count } : stream
            )
          }));
        });

        socketService.onViewerLeft(({ streamId, count }) => {
          set((state) => ({
            streams: state.streams.map(stream =>
              stream.id === streamId ? { ...stream, viewers: count } : stream
            )
          }));
        });

        socketService.onPreviewUpdated(({ streamId, previewUrl }) => {
          console.log(`Store: Received preview update for stream ${streamId}`);
          set((state) => ({
            streams: state.streams.map(stream =>
              stream.id === streamId ? { ...stream, previewUrl, previewError: false } : stream
            )
          }));
          console.log(`Store: Updated preview for stream ${streamId}`);
        });

        socketService.onError((error) => {
          console.error('Socket error:', error.message);
        });

        // Initial fetch of active streams with error handling
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/streams`)
          .then(res => {
            if (!res.ok) {
              throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
          })
          .then(streams => {
            set({ 
              streams,
              activeStreams: new Set(streams.map((s: Stream) => s.id))
            });
          })
          .catch(err => {
            console.error('Error fetching streams:', err);
            // Set empty state on error
            set({ streams: [], activeStreams: new Set() });
          });

        isWebSocketInitialized = true;
      } catch (error) {
        console.error('Error initializing WebSocket:', error);
        isWebSocketInitialized = false;
      }
    },

    addStream: (streamData) => {
      const newStream = {
        ...streamData,
        id: `stream-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        viewers: 0,
        hostId: sessionManager.getUserId()
      };

      set((state) => ({
        streams: [...state.streams, newStream],
        userHostedStreams: new Set(state.userHostedStreams).add(newStream.id)
      }));

      return newStream;
    },

    removeStream: (id) => {
      socketService.endStream(id);
      set((state) => ({
        streams: state.streams.filter(stream => stream.id !== id),
        activeStreams: new Set([...state.activeStreams].filter(streamId => streamId !== id)),
        userHostedStreams: new Set([...state.userHostedStreams].filter(streamId => streamId !== id))
      }));
    },

    updateViewerCount: (id, count) => {
      socketService.updateViewerCount(id, count);
      set((state) => ({
        streams: state.streams.map(stream =>
          stream.id === id ? { ...stream, viewers: count } : stream
        ),
      }));
    },

    getStream: (id) => get().streams.find(s => s.id === id),
    
    startStream: (id) => {
      const stream = get().getStream(id);
      if (stream) {
        socketService.startStream(stream);
        set((state) => ({
          activeStreams: new Set(state.activeStreams).add(id),
          userHostedStreams: new Set(state.userHostedStreams).add(id)
        }));
      }
    },
    
    endStream: (id) => {
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
    
    isStreamActive: (id) => get().activeStreams.has(id),
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
}
