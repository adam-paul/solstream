import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { RedisManager } from './redis';
import { Stream } from './types';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Configure CORS for both REST and WebSocket
const allowedOrigins = ['https://solstream.fun', 'http://localhost:3000'];

// CORS for REST endpoints
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Initialize Socket.io with CORS
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const redisManager = new RedisManager();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// REST endpoints
app.get('/api/streams', async (req, res) => {
  try {
    const streams = await redisManager.getAllStreams();
    res.json(streams);
  } catch (error) {
    console.error('Error fetching streams:', error);
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
});

// WebSocket events
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('startStream', async (streamData: Stream) => {
    try {
      await redisManager.addStream(streamData);
      io.emit('streamStarted', streamData);
      console.log('Stream started:', streamData.id);
    } catch (error) {
      console.error('Error starting stream:', error);
      socket.emit('error', { message: 'Failed to start stream' });
    }
  });

  socket.on('endStream', async (streamId: string) => {
    try {
      await redisManager.removeStream(streamId);
      io.emit('streamEnded', streamId);
      console.log('Stream ended:', streamId);
    } catch (error) {
      console.error('Error ending stream:', error);
      socket.emit('error', { message: 'Failed to end stream' });
    }
  });

  socket.on('updateViewerCount', async ({ streamId, count }: { streamId: string; count: number }) => {
    try {
      await redisManager.updateViewerCount(streamId, count);
      io.emit('viewerCountUpdated', { streamId, count });
    } catch (error) {
      console.error('Error updating viewer count:', error);
      socket.emit('error', { message: 'Failed to update viewer count' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Allowed origins:', allowedOrigins);
});
