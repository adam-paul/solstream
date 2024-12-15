import { create } from 'zustand';
import { socketService } from './socketService';

export interface Stream {
  id: string;
  title: string;
  creator: string;
  createdAt: string;
  marketCap: string;
  viewers: number;
  thumbnail: string;
  ticker?: string;
  description?: string;
}

interface StreamState {
  streams: Stream[];
  activeStreams: Set<string>;
  addStream: (stream: Omit<Stream, 'id' | 'createdAt' | 'viewers'>) => Stream;
  removeStream: (id: string) => void;
  updateViewerCount: (id: string, count: number) => void;
  getStream: (id: string) => Stream | undefined;
  startStream: (id: string) => void;
  endStream: (id: string) => void;
  isStreamActive: (id: string) => boolean;
  initializeWebSocket: () => void;
}

const createStore = () => 
  create<StreamState>((set, get) => ({
    streams: [],
    activeStreams: new Set(),

    initializeWebSocket: () => {
      // Listen for new streams
      socketService.onStreamStarted((stream) => {
        set((state) => ({
          streams: [...state.streams, stream],
          activeStreams: new Set(state.activeStreams).add(stream.id)
        }));
      });

      // Listen for ended streams
      socketService.onStreamEnded((streamId) => {
        set((state) => ({
          streams: state.streams.filter(s => s.id !== streamId),
          activeStreams: new Set([...state.activeStreams].filter(id => id !== streamId))
        }));
      });

      // Listen for viewer count updates
      socketService.onViewerCountUpdated(({ streamId, count }) => {
        set((state) => ({
          streams: state.streams.map(stream =>
            stream.id === streamId ? { ...stream, viewers: count } : stream
          )
        }));
      });

      // Initial fetch of active streams
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/streams`)
        .then(res => res.json())
        .then(streams => {
          set({ 
            streams,
            activeStreams: new Set(streams.map((s: Stream) => s.id))
          });
        })
        .catch(console.error);
    },

    addStream: (streamData) => {
      const newStream = {
        ...streamData,
        id: `stream-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        viewers: 0,
      };

      set((state) => ({
        streams: [...state.streams, newStream],
      }));

      return newStream;
    },

    removeStream: (id) => {
      socketService.endStream(id);
      set((state) => ({
        streams: state.streams.filter(stream => stream.id !== id),
        activeStreams: new Set([...state.activeStreams].filter(streamId => streamId !== id))
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
          activeStreams: new Set(state.activeStreams).add(id)
        }));
      }
    },
    
    endStream: (id) => {
      socketService.endStream(id);
      set((state) => {
        const newActiveStreams = new Set(state.activeStreams);
        newActiveStreams.delete(id);
        return {
          activeStreams: newActiveStreams,
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
