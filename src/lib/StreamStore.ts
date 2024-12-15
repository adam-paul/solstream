import { create } from 'zustand'

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
  activeStreams: Set<string>;  // Track which streams are currently live
  addStream: (stream: Omit<Stream, 'id' | 'createdAt' | 'viewers'>) => Stream;
  removeStream: (id: string) => void;
  updateViewerCount: (id: string, count: number) => void;
  getStream: (id: string) => Stream | undefined;
  startStream: (id: string) => void;  // Mark a stream as active
  endStream: (id: string) => void;    // Mark a stream as ended and remove it
  isStreamActive: (id: string) => boolean;  // Check if a stream is currently live
}

// Create store with SSR/CSR safety
const createStore = () => 
  create<StreamState>((set, get) => ({
    streams: [], // Initialize with empty array instead of mock data
    activeStreams: new Set(), // Initialize with empty set

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

    removeStream: (id) => set((state) => ({
      streams: state.streams.filter(stream => stream.id !== id),
      activeStreams: new Set([...state.activeStreams].filter(streamId => streamId !== id))
    })),

    updateViewerCount: (id, count) => set((state) => ({
      streams: state.streams.map(stream =>
        stream.id === id ? { ...stream, viewers: count } : stream
      ),
    })),

    getStream: (id) => get().streams.find(s => s.id === id),
    
    startStream: (id) => set((state) => ({
      activeStreams: new Set(state.activeStreams).add(id)
    })),
    
    endStream: (id) => set((state) => {
      const newActiveStreams = new Set(state.activeStreams);
      newActiveStreams.delete(id);
      return {
        activeStreams: newActiveStreams,
        streams: state.streams.filter(s => s.id !== id)
      };
    }),
    
    isStreamActive: (id) => get().activeStreams.has(id),
  }));

// Initialize store with SSR/CSR safety
let store: ReturnType<typeof createStore> | undefined;

export const useStreamStore = () => {
  if (typeof window === 'undefined') {
    // Server-side: create a new store instance
    return createStore();
  }
  
  // Client-side: create store once and reuse
  if (!store) {
    store = createStore();
  }
  return store;
}
