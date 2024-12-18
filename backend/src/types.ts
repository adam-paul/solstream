// backend/src/types.ts
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
  previewUrl?: string;
  previewLastUpdated?: number;
  previewError?: boolean;
}

// Error states for preview
export enum PreviewError {
  UNAVAILABLE = 'UNAVAILABLE',
  FAILED = 'FAILED'
}