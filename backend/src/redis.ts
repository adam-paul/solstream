// backend/src/redis.ts

import Redis from 'ioredis';
import { Stream, ChatMessage } from './types';

interface StreamMetadata {
  lastUpdated: number;
  roleMap: Record<string, 'host' | 'audience'>;
}

class RedisManager {
  private redis: Redis;
  private readonly STREAM_KEY = 'streams';
  private readonly STREAM_METADATA_KEY = 'stream_metadata';
  private readonly STREAM_MESSAGES_KEY = 'stream_messages';
  private readonly MAX_MESSAGES = 20;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      commandTimeout: 5000,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 1000, 3000)
    });

    this.redis.on('error', console.error);
    this.redis.on('ready', () => console.log('Redis connected'));
  }

  private async execCommand<T>(
    operation: () => Promise<T>,
    errorMessage: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.error(`${errorMessage}:`, error);
      throw new Error(errorMessage);
    }
  }

  async addStream(stream: Stream): Promise<void> {
    await this.execCommand(async () => {
      const pipeline = this.redis.pipeline();
      pipeline.hset(this.STREAM_KEY, stream.id, JSON.stringify(stream));
      pipeline.hset(this.STREAM_METADATA_KEY, stream.id, JSON.stringify({
        lastUpdated: Date.now(),
        roleMap: { [stream.creator]: 'host' }
      }));
      await pipeline.exec();
    }, 'Failed to add stream');
  }

  async removeStream(streamId: string): Promise<void> {
    await this.execCommand(async () => {
      const pipeline = this.redis.pipeline();
      pipeline.hdel(this.STREAM_KEY, streamId);
      pipeline.hdel(this.STREAM_METADATA_KEY, streamId);
      pipeline.del(`${this.STREAM_MESSAGES_KEY}:${streamId}`);
      await pipeline.exec();
    }, 'Failed to remove stream');
  }

  async getAllStreams(): Promise<Stream[]> {
    return this.execCommand(async () => {
      const streams = await this.redis.hgetall(this.STREAM_KEY);
      return Object.values(streams).map(stream => JSON.parse(stream));
    }, 'Failed to fetch streams');
  }

  async getStream(streamId: string): Promise<Stream | null> {
    return this.execCommand(async () => {
      const streamData = await this.redis.hget(this.STREAM_KEY, streamId);
      return streamData ? JSON.parse(streamData) : null;
    }, 'Failed to fetch stream');
  }

  async updateStreamData(
    streamId: string,
    updateFn: (stream: Stream) => Stream
  ): Promise<void> {
    await this.execCommand(async () => {
      const stream = await this.getStream(streamId);
      if (!stream) throw new Error('Stream not found');

      const updatedStream = updateFn(stream);
      await this.redis.hset(
        this.STREAM_KEY,
        streamId,
        JSON.stringify(updatedStream)
      );
    }, 'Failed to update stream');
  }

  async updateStreamRole(
    streamId: string,
    userId: string,
    role: 'host' | 'audience' | null
  ): Promise<void> {
    await this.execCommand(async () => {
      const metadata = await this.redis.hget(this.STREAM_METADATA_KEY, streamId);
      const parsed = metadata ? JSON.parse(metadata) : { roleMap: {} };
      
      if (role === null) {
        delete parsed.roleMap[userId];
      } else {
        parsed.roleMap[userId] = role;
      }
      
      parsed.lastUpdated = Date.now();
      
      await this.redis.hset(
        this.STREAM_METADATA_KEY,
        streamId,
        JSON.stringify(parsed)
      );
    }, 'Failed to update role');
  }

  // Chat Methods
  async addMessage(streamId: string, message: ChatMessage): Promise<void> {
    await this.execCommand(async () => {
      const key = `${this.STREAM_MESSAGES_KEY}:${streamId}`;
      
      // Add new message
      await this.redis.lpush(key, JSON.stringify(message));
      
      // Trim to last 20 messages
      await this.redis.ltrim(key, 0, this.MAX_MESSAGES - 1);
    }, 'Failed to add message');
  }

  async getMessages(streamId: string): Promise<ChatMessage[]> {
    return this.execCommand(async () => {
      const key = `${this.STREAM_MESSAGES_KEY}:${streamId}`;
      const messages = await this.redis.lrange(key, 0, -1);
      return messages.map(msg => JSON.parse(msg));
    }, 'Failed to fetch messages');
  }

  async clearMessages(streamId: string): Promise<void> {
    await this.execCommand(async () => {
      const key = `${this.STREAM_MESSAGES_KEY}:${streamId}`;
      await this.redis.del(key);
    }, 'Failed to clear messages');
  }

  async shutdown(): Promise<void> {
    await this.redis.quit();
  }
}

export { RedisManager, type StreamMetadata };
