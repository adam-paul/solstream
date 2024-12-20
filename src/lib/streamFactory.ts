// src/lib/factories/streamFactory.ts

import { Stream } from '@/types/stream';

export const createStream = (
  input: Pick<Stream, 'title' | 'ticker' | 'coinAddress'>,
  creator: string
): Omit<Stream, 'id'> => ({
  ...input,
  creator,
  createdAt: new Date().toISOString(),
  viewers: 0,
  marketCap: '0',
  description: '',
  thumbnail: "/api/placeholder/400/300",
  previewUrl: undefined
});