// backend/src/server.ts

import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { RedisManager, type StreamMetadata } from './redis';
import { Stream } from './types';

dotenv.config();

// Types for socket events
interface ServerToClientEvents {
  streamStarted: (stream: Stream) => void;
  streamEnded: (streamId: string) => void;
  viewerJoined: (data: { streamId: string; count: number }) => void;
  viewerLeft: (data: { streamId: string; count: number }) => void;
  viewerCountUpdated: (data: { streamId: string; count: number }) => void;
  previewUpdated: (data: { streamId: string; previewUrl: string }) => void;
  roleChanged: (data: { streamId: string; role: 'host' | 'viewer' | null }) => void;
  error: (error: { message: string; statusCode?: number; timestamp?: string }) => void;
}

interface ClientToServerEvents {
  startStream: (stream: Stream) => void;
  endStream: (streamId: string) => void;
  joinStream: (streamId: string) => void;
  leaveStream: (streamId: string) => void;
  updateViewerCount: (data: { streamId: string; count: number }) => void;
  updatePreview: (data: { streamId: string; previewUrl: string }) => void;
}

interface UserState {
  socketId: string;
  streams: Set<string>;
  roles: Map<string, 'host' | 'viewer'>;
  lastActive: Date;
}

class StreamServer {
  private app: express.Express;
  private httpServer: ReturnType<typeof createServer>;
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private redisManager: RedisManager;
  private connectedUsers: Map<string, UserState>;
  private readonly allowedOrigins = [
    'https://solstream.fun',
    'https://www.solstream.fun',
    'https://api.solstream.fun',
    'http://localhost:3000'
  ];

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.redisManager = new RedisManager();
    this.connectedUsers = new Map();

    // Initialize Socket.IO with CORS config
    this.io = new Server(this.httpServer, {
      cors: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
          if (!origin || this.allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Access-Control-Allow-Origin']
      },
      transports: ['websocket']
    });

    this.setupMiddleware();
    this.setupSocketServer();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware() {
    this.io = new Server(this.httpServer, {
      transports: ['websocket']
    });
  }

  private setupSocketServer() {
    this.io.on('connection', (socket: Socket) => this.handleConnection(socket));
  }

  private setupRoutes() {
    // Health check endpoint - no CORS middleware
    this.app.get('/health', (_, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Get all streams endpoint - no CORS middleware
    this.app.get('/api/streams', async (_, res) => {
      try {
        const streams = await this.redisManager.getAllStreams();
        res.json(streams);
      } catch (error) {
        console.error('Error fetching streams:', error);
        res.status(500).json({ error: 'Failed to fetch streams' });
      }
    });
  }

  private setupErrorHandling() {
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Unhandled error:', err);
      res.status(500).json({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      // Gracefully shutdown on uncaught exceptions
      this.shutdown().catch(console.error);
    });
  }

  private async handleConnection(socket: Socket) {
    const userId = socket.handshake.query.userId as string;
    
    if (!userId) {
      socket.emit('error', { 
        message: 'User ID required',
        timestamp: new Date().toISOString()
      });
      socket.disconnect();
      return;
    }

    console.log('Client connected:', { socketId: socket.id, userId });

    // Initialize or update user state
    this.connectedUsers.set(userId, {
      socketId: socket.id,
      streams: new Set(),
      roles: new Map(),
      lastActive: new Date()
    });

    this.setupSocketHandlers(socket, userId);
  }

  private setupSocketHandlers(socket: Socket, userId: string) {
    const handlers = {
      startStream: async (stream: Stream) => {
        try {
          if (stream.creator !== userId) {
            throw new Error('Unauthorized to start this stream');
          }

          await Promise.all([
            this.redisManager.addStream(stream),
            this.redisManager.updateStreamRole(stream.id, userId, 'host')
          ]);

          this.updateUserRole(userId, stream.id, 'host');
          this.io.emit('streamStarted', stream);

        } catch (error) {
          this.handleError(socket, error);
          try {
            await this.redisManager.removeStream(stream.id);
          } catch (cleanupError) {
            console.error('Cleanup error after failed stream start:', cleanupError);
          }
        }
      },

      endStream: async (streamId: string) => {
        try {
          const stream = await this.redisManager.getStream(streamId);

          if (!stream) {
            throw new Error('Stream not found');
          }

          if (stream.creator !== userId) {
            throw new Error('Unauthorized to end this stream');
          }

          await Promise.all([
            this.redisManager.removeStream(streamId),
            ...Array.from(this.connectedUsers.entries())
              .filter(([_, state]) => state.streams.has(streamId))
              .map(([uid, _]) => 
                this.redisManager.updateStreamRole(streamId, uid, null)
              )
          ]);

          this.cleanupStream(streamId);
          this.io.emit('streamEnded', streamId);

        } catch (error) {
          this.handleError(socket, error);
        }
      },

      joinStream: async (streamId: string) => {
        try {
          const stream = await this.redisManager.getStream(streamId);

          if (!stream) {
            throw new Error('Stream not found');
          }

          if (stream.creator === userId) {
            throw new Error('Cannot view your own stream');
          }

          await this.redisManager.updateStreamRole(streamId, userId, 'viewer');
          this.updateUserRole(userId, streamId, 'viewer');
          socket.join(streamId);

          const roomSize = this.io.sockets.adapter.rooms.get(streamId)?.size || 0;
          await this.redisManager.updateViewerCount(streamId, roomSize);

          this.io.to(streamId).emit('viewerJoined', { 
            streamId, 
            count: roomSize 
          });

        } catch (error) {
          this.handleError(socket, error);
        }
      },

      leaveStream: async (streamId: string) => {
        try {
          await this.redisManager.updateStreamRole(streamId, userId, null);
          this.removeUserFromStream(userId, streamId);
          socket.leave(streamId);

          const roomSize = this.io.sockets.adapter.rooms.get(streamId)?.size || 0;
          await this.redisManager.updateViewerCount(streamId, roomSize);
          
          this.io.to(streamId).emit('viewerLeft', { 
            streamId, 
            count: roomSize 
          });

        } catch (error) {
          this.handleError(socket, error);
        }
      },

      updateViewerCount: async ({ streamId, count }: { streamId: string; count: number }) => {
        try {
          await this.redisManager.updateViewerCount(streamId, count);
          this.io.emit('viewerCountUpdated', { streamId, count });
        } catch (error) {
          this.handleError(socket, error);
        }
      },

      updatePreview: async ({ streamId, previewUrl }: { streamId: string; previewUrl: string }) => {
        try {
          const stream = await this.redisManager.getStream(streamId);
          if (!stream || stream.creator !== userId) {
            throw new Error('Unauthorized to update preview');
          }

          await this.redisManager.updatePreview(streamId, previewUrl);
          this.io.emit('previewUpdated', { streamId, previewUrl });

        } catch (error) {
          this.handleError(socket, error);
          try {
            await this.redisManager.setPreviewError(streamId);
          } catch (previewError) {
            console.error('Failed to set preview error:', previewError);
          }
        }
      },

      disconnect: () => {
        this.handleDisconnect(userId);
      }
    };

    // Register all handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });
  }

  private updateUserRole(userId: string, streamId: string, role: 'host' | 'viewer') {
    const userState = this.connectedUsers.get(userId);
    if (userState) {
      userState.roles.set(streamId, role);
      userState.streams.add(streamId);
      userState.lastActive = new Date();
      
      const socket = this.io.sockets.sockets.get(userState.socketId);
      if (socket) {
        socket.emit('roleChanged', { streamId, role });
      }
    }
  }

  private removeUserFromStream(userId: string, streamId: string) {
    const userState = this.connectedUsers.get(userId);
    if (userState) {
      userState.roles.delete(streamId);
      userState.streams.delete(streamId);
      userState.lastActive = new Date();

      const socket = this.io.sockets.sockets.get(userState.socketId);
      if (socket) {
        socket.emit('roleChanged', { streamId, role: null });
      }
    }
  }

  private cleanupStream(streamId: string) {
    this.connectedUsers.forEach((state, userId) => {
      if (state.streams.has(streamId)) {
        this.removeUserFromStream(userId, streamId);
      }
    });
  }

  private async handleDisconnect(userId: string) {
    const userState = this.connectedUsers.get(userId);
    if (!userState) return;

    try {
      await Promise.all(Array.from(userState.streams).map(async (streamId) => {
        const role = userState.roles.get(streamId);
        
        if (role === 'host') {
          try {
            await Promise.all([
              this.redisManager.removeStream(streamId),
              this.redisManager.updateStreamRole(streamId, userId, null)
            ]);
            this.io.emit('streamEnded', streamId);
          } catch (error) {
            console.error(`Failed to cleanup host stream ${streamId}:`, error);
          }
        } else if (role === 'viewer') {
          try {
            await Promise.all([
              this.redisManager.updateStreamRole(streamId, userId, null),
              this.redisManager.updateViewerCount(
                streamId, 
                Math.max(0, (this.io.sockets.adapter.rooms.get(streamId)?.size || 1) - 1)
              )
            ]);
            
            this.io.to(streamId).emit('viewerLeft', {
              streamId,
              count: Math.max(0, (this.io.sockets.adapter.rooms.get(streamId)?.size || 1) - 1)
            });
          } catch (error) {
            console.error(`Failed to cleanup viewer from stream ${streamId}:`, error);
          }
        }
      }));
    } catch (error) {
      console.error('Error in disconnect handler:', error);
    } finally {
      this.connectedUsers.delete(userId);
    }
  }

  private handleError(socket: Socket, error: unknown) {
    let message: string;
    let statusCode = 500;

    if (error instanceof Error) {
      message = error.message;
      
      if (message.includes('Unauthorized')) {
        statusCode = 403;
      } else if (message.includes('not found')) {
        statusCode = 404;
      } else if (message.includes('Redis')) {
        message = 'Service temporarily unavailable';
        statusCode = 503;
      }
    } else {
      message = 'An unexpected error occurred';
    }

    console.error('Socket error:', {
      statusCode,
      message,
      error,
      socketId: socket.id,
      userId: socket.handshake.query.userId
    });

    socket.emit('error', { 
      message,
      statusCode,
      timestamp: new Date().toISOString()
    });
  }

  async shutdown() {
    console.log('Server shutting down...');
    
    // Close all socket connections
    this.io.sockets.sockets.forEach((socket) => {
      socket.disconnect(true);
    });

    // Close Redis connection
    await this.redisManager.shutdown();

    // Close HTTP server
    this.httpServer.close();

    console.log('Server shutdown complete');
  }

  public start(port: number = 3001) {
    this.httpServer.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log('Allowed origins:', this.allowedOrigins);
    });
  }
}

// Create and start server
const server = new StreamServer();
server.start(parseInt(process.env.PORT || '3001', 10));
