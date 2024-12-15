// backend/src/redis.ts
import Redis from 'ioredis';
import { Stream } from './types';

export class RedisManager {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });
  }

  async addStream(stream: Stream): Promise<void> {
    await this.redis.hset(
      'streams',
      stream.id,
      JSON.stringify(stream)
    );
  }

  async removeStream(streamId: string): Promise<void> {
    await this.redis.hdel('streams', streamId);
  }

  async getAllStreams(): Promise<Stream[]> {
    const streams = await this.redis.hgetall('streams');
    return Object.values(streams).map(stream => JSON.parse(stream));
  }

  async updateViewerCount(streamId: string, count: number): Promise<void> {
    const streamData = await this.redis.hget('streams', streamId);
    if (streamData) {
      const stream = JSON.parse(streamData);
      stream.viewers = count;
      await this.redis.hset('streams', streamId, JSON.stringify(stream));
    }
  }

  async getStream(streamId: string): Promise<Stream | null> {
    const streamData = await this.redis.hget('streams', streamId);
    return streamData ? JSON.parse(streamData) : null;
  }
}
