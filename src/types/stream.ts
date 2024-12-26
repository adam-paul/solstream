// src/types/stream.ts

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
