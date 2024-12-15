import { io, Socket } from 'socket.io-client';
import type { Stream } from './StreamStore';

class SocketService {
  private socket: Socket | null = null;
  private static instance: SocketService;

  private constructor() {}

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  connect() {
    if (!this.socket) {
      this.socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001', {
        transports: ['websocket'],
        secure: true
      });
      
      this.socket.on('connect', () => {
        console.log('Connected to WebSocket server');
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
      });
    }
    return this.socket;
  }

  startStream(stream: Stream) {
    this.socket?.emit('startStream', stream);
  }

  endStream(streamId: string) {
    this.socket?.emit('endStream', streamId);
  }

  updateViewerCount(streamId: string, count: number) {
    this.socket?.emit('updateViewerCount', { streamId, count });
  }

  onStreamStarted(callback: (stream: Stream) => void) {
    this.socket?.on('streamStarted', callback);
  }

  onStreamEnded(callback: (streamId: string) => void) {
    this.socket?.on('streamEnded', callback);
  }

  onViewerCountUpdated(callback: (data: { streamId: string; count: number }) => void) {
    this.socket?.on('viewerCountUpdated', callback);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = SocketService.getInstance();
