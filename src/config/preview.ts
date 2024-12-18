// src/config/preview.ts
import { PreviewConfig } from '@/types/stream';

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  initialDelay: process.env.NEXT_PUBLIC_PREVIEW_INITIAL_DELAY 
    ? parseInt(process.env.NEXT_PUBLIC_PREVIEW_INITIAL_DELAY) 
    : 10000, // 10 seconds
  updateInterval: process.env.NEXT_PUBLIC_PREVIEW_UPDATE_INTERVAL 
    ? parseInt(process.env.NEXT_PUBLIC_PREVIEW_UPDATE_INTERVAL) 
    : 60000, // 1 minute
  compressionQuality: process.env.NEXT_PUBLIC_PREVIEW_COMPRESSION_QUALITY 
    ? parseFloat(process.env.NEXT_PUBLIC_PREVIEW_COMPRESSION_QUALITY) 
    : 0.8
};
