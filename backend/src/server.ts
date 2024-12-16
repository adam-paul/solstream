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

const allowedOrigins = [
  'https://solstream.fun',
  'https://www.solstream.fun',
  'https://api.solstream.fun',
  'http://localhost:3000'
];

// CORS configuration - moved to top
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Access-Control-Allow-Origin']
}));

// Handle preflight requests
app.options('*', cors());

// Socket.IO CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

const redisManager = new RedisManager();

// Track connected users and their roles
const connectedUsers = new Map<string, {
  socketId: string;
  streams: Set<string>; // Streams they're hosting or viewing
  role: 'host' | 'viewer' | null;
}>();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/streams', cors(), async (req, res) => {
  try {
    const streams = await redisManager.getAllStreams();
    res.header('Access-Control-Allow-Origin', 'https://www.solstream.fun');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.json(streams);
  } catch (error) {
    console.error('Error fetching streams:', error);
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  const userId = socket.handshake.query.userId as string;

  if (userId) {
    connectedUsers.set(userId, {
      socketId: socket.id,
      streams: new Set(),
      role: null
    });
  }

  socket.on('startStream', async (streamData: Stream) => {
    try {
      if (streamData.creator !== userId) {
        socket.emit('error', { message: 'Unauthorized to start this stream' });
        return;
      }

      // Ensure stream doesn't already exist
      const existingStream = await redisManager.getStream(streamData.id);
      if (existingStream) {
        socket.emit('error', { message: 'Stream already exists' });
        return;
      }

      await redisManager.addStream(streamData);
      
      // Update user's role for this stream
      const userData = connectedUsers.get(userId);
      if (userData) {
        userData.streams.add(streamData.id);
        userData.role = 'host';
        connectedUsers.set(userId, userData);
      }

      // Broadcast to all connected clients
      io.emit('streamStarted', streamData);
      console.log('Stream started:', streamData.id, 'by user:', userId);
    } catch (error) {
      console.error('Error starting stream:', error);
      socket.emit('error', { message: 'Failed to start stream' });
    }
  });

  socket.on('endStream', async (streamId: string) => {
    try {
      const stream = await redisManager.getStream(streamId);
      
      if (stream && stream.creator !== userId) {
        socket.emit('error', { message: 'Unauthorized to end this stream' });
        return;
      }

      await redisManager.removeStream(streamId);
      
      // Update roles for all users viewing this stream
      connectedUsers.forEach((userData, uid) => {
        if (userData.streams.has(streamId)) {
          userData.streams.delete(streamId);
          if (userData.streams.size === 0) {
            userData.role = null;
          }
          connectedUsers.set(uid, userData);
        }
      });

      io.emit('streamEnded', streamId);
      console.log('Stream ended:', streamId);
    } catch (error) {
      console.error('Error ending stream:', error);
      socket.emit('error', { message: 'Failed to end stream' });
    }
  });

  socket.on('joinStream', async (streamId: string) => {
    try {
      const stream = await redisManager.getStream(streamId);
      if (!stream) {
        socket.emit('error', { message: 'Stream not found' });
        return;
      }

      // Don't let the host join as viewer
      if (stream.creator === userId) {
        socket.emit('error', { message: 'Cannot view your own stream' });
        return;
      }

      const userData = connectedUsers.get(userId);
      if (userData) {
        userData.streams.add(streamId);
        userData.role = 'viewer';
        connectedUsers.set(userId, userData);
      }

      socket.join(streamId);
      io.to(streamId).emit('viewerJoined', { streamId, count: io.sockets.adapter.rooms.get(streamId)?.size || 0 });
    } catch (error) {
      console.error('Error joining stream:', error);
      socket.emit('error', { message: 'Failed to join stream' });
    }
  });

  socket.on('leaveStream', async (streamId: string) => {
    const userData = connectedUsers.get(userId);
    if (userData) {
      userData.streams.delete(streamId);
      if (userData.streams.size === 0) {
        userData.role = null;
      }
      connectedUsers.set(userId, userData);
    }

    socket.leave(streamId);
    io.to(streamId).emit('viewerLeft', { streamId, count: io.sockets.adapter.rooms.get(streamId)?.size || 0 });
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
    if (userId) {
      const userData = connectedUsers.get(userId);
      if (userData) {
        // Clean up any streams this user was hosting or viewing
        userData.streams.forEach(streamId => {
          if (userData.role === 'host') {
            redisManager.removeStream(streamId).catch(console.error);
            io.emit('streamEnded', streamId);
          } else {
            io.to(streamId).emit('viewerLeft', { 
              streamId, 
              count: (io.sockets.adapter.rooms.get(streamId)?.size || 1) - 1
            });
          }
        });
        connectedUsers.delete(userId);
      }
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Allowed origins:', allowedOrigins);
});
