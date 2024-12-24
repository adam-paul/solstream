// backend/src/server.ts

import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { RedisManager } from './redis';
import { Stream } from './types';

dotenv.config();

type StreamId = string;
type ViewerCount = number;

interface ServerToClientEvents {
  streamStarted: (stream: Stream) => void;
  streamEnded: (streamId: StreamId) => void;
  viewerJoined: (data: { streamId: StreamId; count: ViewerCount }) => void;
  viewerLeft: (data: { streamId: StreamId; count: ViewerCount }) => void;
  streamPreview: (data: { streamId: StreamId; preview: string }) => void;
  roleChanged: (data: { streamId: StreamId; role: 'host' | 'viewer' | null }) => void;
  error: (error: { message: string; statusCode?: number }) => void;
}

interface ClientToServerEvents {
  startStream: (stream: Stream) => void;
  endStream: (streamId: StreamId) => void;
  joinStream: (streamId: StreamId) => void;
  leaveStream: (streamId: StreamId) => void;
  streamPreview: (data: { streamId: StreamId; preview: string }) => void;
}

export class StreamServer {
  private app: express.Express;
  private httpServer: ReturnType<typeof createServer>;
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private redisManager: RedisManager;
  private connectedUsers: Map<string, string>; // userId -> socketId

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.redisManager = new RedisManager();
    this.connectedUsers = new Map();

    this.io = new Server(this.httpServer, {
      cors: { origin: process.env.FRONTEND_URL || "https://www.solstream.fun" },
      transports: ['websocket']
    });

    this.setupRoutes();
    this.setupSocketServer();
  }

  private setupRoutes() {
    this.app.get('/health', (_, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/api/streams', async (_, res) => {
      try {
        const streams = await this.redisManager.getAllStreams();
        res.json(streams);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch streams' });
      }
    });
  }

  private setupSocketServer() {
    this.io.on('connection', (socket: Socket) => {
      const userId = socket.handshake.query.userId as string;
      if (!userId) {
        socket.emit('error', { message: 'User ID required', statusCode: 400 });
        socket.disconnect();
        return;
      }

      this.connectedUsers.set(userId, socket.id);

      socket.on('startStream', async (stream: Stream) => {
        try {
          if (stream.creator !== userId) {
            throw new Error('Unauthorized');
          }

          await this.redisManager.addStream(stream);
          this.io.emit('streamStarted', stream);
        } catch (error) {
          this.handleError(socket, error);
        }
      });

      socket.on('endStream', async (streamId: StreamId) => {
        try {
          const stream = await this.redisManager.getStream(streamId);
          if (!stream || stream.creator !== userId) {
            throw new Error('Unauthorized');
          }

          await this.redisManager.removeStream(streamId);
          this.io.emit('streamEnded', streamId);
        } catch (error) {
          this.handleError(socket, error);
        }
      });

      socket.on('joinStream', async (streamId: StreamId) => {
        try {
          const stream = await this.redisManager.getStream(streamId);
          if (!stream) throw new Error('Stream not found');
          if (stream.creator === userId) throw new Error('Cannot join own stream');

          await this.redisManager.updateStreamRole(streamId, userId, 'viewer');
          socket.join(streamId);

          const roomSize = this.io.sockets.adapter.rooms.get(streamId)?.size || 0;
          await this.redisManager.updateStreamData(streamId, stream => ({
            ...stream,
            viewers: roomSize
          }));

          this.io.to(streamId).emit('viewerJoined', { streamId, count: roomSize });
          socket.emit('roleChanged', { streamId, role: 'viewer' });

          // Send existing preview if available
          const preview = await this.redisManager.getStreamPreview(streamId);
          if (preview) {
            socket.emit('streamPreview', { streamId, preview });
          }
        } catch (error) {
          this.handleError(socket, error);
        }
      });

      socket.on('leaveStream', async (streamId: StreamId) => {
        try {
          await this.redisManager.updateStreamRole(streamId, userId, null);
          socket.leave(streamId);

          const roomSize = this.io.sockets.adapter.rooms.get(streamId)?.size || 0;
          await this.redisManager.updateStreamData(streamId, stream => ({
            ...stream,
            viewers: roomSize
          }));

          this.io.to(streamId).emit('viewerLeft', { streamId, count: roomSize });
          socket.emit('roleChanged', { streamId, role: null });
        } catch (error) {
          this.handleError(socket, error);
        }
      });

      socket.on('streamPreview', async ({ streamId, preview }) => {
        try {
          const stream = await this.redisManager.getStream(streamId);
          if (!stream || stream.creator !== userId) {
            throw new Error('Unauthorized');
          }

          await this.redisManager.setStreamPreview(streamId, preview);
          this.io.emit('streamPreview', { streamId, preview });
        } catch (error) {
          this.handleError(socket, error);
        }
      });

      socket.on('disconnect', async () => {
        this.connectedUsers.delete(userId);
      });
    });
  }

  private handleError(socket: Socket, error: unknown) {
    const baseError = {
      message: 'Internal server error',
      statusCode: 500
    };

    if (error instanceof Error) {
      if (error.message.includes('Unauthorized')) {
        baseError.statusCode = 403;
        baseError.message = error.message;
      } else if (error.message.includes('not found')) {
        baseError.statusCode = 404;
        baseError.message = error.message;
      }
    }

    socket.emit('error', baseError);
  }

  async shutdown() {
    console.log('Server shutting down...');
    
    for (const socket of this.io.sockets.sockets.values()) {
      socket.disconnect(true);
    }

    await this.redisManager.shutdown();
    this.httpServer.close();
  }

  start(port: number = 3001) {
    this.httpServer.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  }
}

// Start the server
const server = new StreamServer();
server.start(parseInt(process.env.PORT || '3001', 10));
