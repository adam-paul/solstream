// backend/src/types.ts

export interface Stream {
  id: string;
  title: string;
  creator: string;
  createdAt: string;
  marketCap: string;
  viewers: number;
  thumbnail: string;
  ticker: string;
  coinAddress: string;
  description?: string;
  isLive: boolean;
}

export interface ChatMessage {
  username: string;
  content: string;
  timestamp: number;
}
