// backend/src/redis.ts

import Redis from 'ioredis';
import { Stream } from './types';

interface StreamMetadata {
  lastUpdated: number;
  roleMap: Record<string, 'host' | 'viewer'>;  // userId -> role
  error?: string;
}

class RedisManager {
  private redis: Redis;
  private readonly STREAM_KEY = 'streams';
  private readonly STREAM_METADATA_KEY = 'stream_metadata';
  private readonly REDIS_OPERATION_TIMEOUT = 5000; // 5 seconds

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times: number) => {
        if (times > 3) {
          throw new Error('Redis connection failed');
        }
        return Math.min(times * 1000, 3000);
      }
    });

    this.setupErrorHandling();
  }

  private setupErrorHandling() {
    this.redis.on('error', (error) => {
      console.error('Redis error:', error);
    });

    this.redis.on('ready', () => {
      console.log('Redis connection established');
    });
  }

  private async withTimeout<T>(operation: Promise<T>, errorMessage: string): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout: ${errorMessage}`)), this.REDIS_OPERATION_TIMEOUT);
    });

    return Promise.race([operation, timeout]);
  }

  async addStream(stream: Stream): Promise<void> {
    try {
      const metadata: StreamMetadata = {
        lastUpdated: Date.now(),
        roleMap: { [stream.creator]: 'host' }
      };

      await this.withTimeout(Promise.all([
        this.redis.hset(this.STREAM_KEY, stream.id, JSON.stringify(stream)),
        this.redis.hset(this.STREAM_METADATA_KEY, stream.id, JSON.stringify(metadata))
      ]), 'Failed to add stream');
    } catch (error) {
      console.error('Error adding stream:', error);
      throw new Error('Failed to add stream to Redis');
    }
  }

  async removeStream(streamId: string): Promise<void> {
    try {
      await this.withTimeout(Promise.all([
        this.redis.hdel(this.STREAM_KEY, streamId),
        this.redis.hdel(this.STREAM_METADATA_KEY, streamId)
      ]), 'Failed to remove stream');
    } catch (error) {
      console.error('Error removing stream:', error);
      throw new Error('Failed to remove stream from Redis');
    }
  }

  async getAllStreams(): Promise<Stream[]> {
    try {
      const streams = await this.withTimeout(
        this.redis.hgetall(this.STREAM_KEY),
        'Failed to fetch streams'
      );

      return Object.values(streams).map(stream => JSON.parse(stream));
    } catch (error) {
      console.error('Error fetching streams:', error);
      throw new Error('Failed to fetch streams from Redis');
    }
  }

  async getStream(streamId: string): Promise<Stream | null> {
    try {
      const streamData = await this.withTimeout(
        this.redis.hget(this.STREAM_KEY, streamId),
        'Failed to fetch stream'
      );

      return streamData ? JSON.parse(streamData) : null;
    } catch (error) {
      console.error('Error fetching stream:', error);
      throw new Error('Failed to fetch stream from Redis');
    }
  }

  async updateViewerCount(streamId: string, count: number): Promise<void> {
    try {
      const stream = await this.getStream(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      const updatedStream = { ...stream, viewers: count };
      await this.withTimeout(
        this.redis.hset(this.STREAM_KEY, streamId, JSON.stringify(updatedStream)),
        'Failed to update viewer count'
      );
    } catch (error) {
      console.error('Error updating viewer count:', error);
      throw new Error('Failed to update viewer count in Redis');
    }
  }

  async updatePreview(streamId: string, previewUrl: string): Promise<void> {
    try {
      const stream = await this.getStream(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      const updatedStream = {
        ...stream,
        previewUrl,
        previewLastUpdated: Date.now(),
        previewError: false
      };

      await this.withTimeout(
        this.redis.hset(this.STREAM_KEY, streamId, JSON.stringify(updatedStream)),
        'Failed to update preview'
      );
    } catch (error) {
      console.error('Error updating preview:', error);
      throw new Error('Failed to update preview in Redis');
    }
  }

  async setPreviewError(streamId: string): Promise<void> {
    try {
      const stream = await this.getStream(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      const updatedStream = {
        ...stream,
        previewError: true,
        previewUrl: undefined
      };

      await this.withTimeout(
        this.redis.hset(this.STREAM_KEY, streamId, JSON.stringify(updatedStream)),
        'Failed to set preview error'
      );
    } catch (error) {
      console.error('Error setting preview error:', error);
      throw new Error('Failed to set preview error in Redis');
    }
  }

  async getStreamMetadata(streamId: string): Promise<StreamMetadata | null> {
    try {
      const metadata = await this.withTimeout(
        this.redis.hget(this.STREAM_METADATA_KEY, streamId),
        'Failed to fetch stream metadata'
      );

      return metadata ? JSON.parse(metadata) : null;
    } catch (error) {
      console.error('Error fetching stream metadata:', error);
      throw new Error('Failed to fetch stream metadata from Redis');
    }
  }

  async updateStreamRole(streamId: string, userId: string, role: 'host' | 'viewer' | null): Promise<void> {
    try {
      const metadata = await this.getStreamMetadata(streamId) || {
        lastUpdated: Date.now(),
        roleMap: {}
      };

      if (role === null) {
        delete metadata.roleMap[userId];
      } else {
        metadata.roleMap[userId] = role;
      }

      metadata.lastUpdated = Date.now();

      await this.withTimeout(
        this.redis.hset(this.STREAM_METADATA_KEY, streamId, JSON.stringify(metadata)),
        'Failed to update stream role'
      );
    } catch (error) {
      console.error('Error updating stream role:', error);
      throw new Error('Failed to update stream role in Redis');
    }
  }

  // Utility method for atomic updates
  private async updateStreamData(
    streamId: string,
    updateFn: (stream: Stream) => Stream
  ): Promise<void> {
    const stream = await this.getStream(streamId);
    if (!stream) {
      throw new Error('Stream not found');
    }

    const updatedStream = updateFn(stream);
    await this.withTimeout(
      this.redis.hset(this.STREAM_KEY, streamId, JSON.stringify(updatedStream)),
      'Failed to update stream data'
    );
  }

  async shutdown(): Promise<void> {
    await this.redis.quit();
  }
}

export { RedisManager, type StreamMetadata };
