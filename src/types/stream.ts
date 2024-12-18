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
  previewUrl?: string;
  previewLastUpdated?: number;
  previewError?: boolean;
}

export enum PreviewError {
  UNAVAILABLE = 'UNAVAILABLE',
  FAILED = 'FAILED'
}

// Preview configuration types
export interface PreviewConfig {
  initialDelay: number;  // milliseconds before first preview
  updateInterval: number;  // milliseconds between preview updates
  compressionQuality?: number;  // 0-1 for image quality
}
