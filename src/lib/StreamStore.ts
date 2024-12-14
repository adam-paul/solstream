import { create } from 'zustand'

export interface Stream {
  id: number | string;
  title: string;
  creator: string;
  createdAt: string;
  marketCap: string;
  viewers: number;
  thumbnail: string;
  ticker?: string;
  description?: string;
  channelName?: string;  // Added for Agora channel reference
}

// Initial mock data
const mockStreams: Stream[] = [
  {
    id: 1,
    title: "SOL Trading Analysis",
    creator: "CryptoExpert",
    createdAt: "1m ago",
    marketCap: "$48.4K",
    viewers: 156,
    thumbnail: "/api/placeholder/400/300"
  },
];

interface StreamState {
  streams: Stream[];
  addStream: (stream: Omit<Stream, 'id' | 'createdAt' | 'viewers' | 'channelName'>) => void;
  removeStream: (id: string | number) => void;
  updateViewerCount: (id: string | number, count: number) => void;
  getChannelName: (id: string | number) => string | undefined;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  streams: mockStreams,

  addStream: (streamData) => set((state) => ({
    streams: [
      ...state.streams,
      {
        ...streamData,
        id: crypto.randomUUID(),
        createdAt: '1m ago',
        viewers: 0,
        channelName: `stream-${streamData.title.replace(/\s+/g, '-').toLowerCase()}`
      },
    ],
  })),

  removeStream: (id) => set((state) => ({
    streams: state.streams.filter(stream => stream.id !== id),
  })),

  updateViewerCount: (id, count) => set((state) => ({
    streams: state.streams.map(stream =>
      stream.id === id ? { ...stream, viewers: count } : stream
    ),
  })),

  getChannelName: (id) => {
    const stream = get().streams.find(s => s.id === id);
    return stream?.channelName;
  },
}));