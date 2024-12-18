import { io, Socket } from 'socket.io-client';
import { Stream } from '@/types/stream';
import { sessionManager } from './sessionManager';

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
      console.log('Initializing socket connection...');
      // Include userId in connection query
      this.socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001', {
        transports: ['websocket'],
        secure: true,
        query: {
          userId: sessionManager.getUserId()
        }
      });
      
      this.socket.on('connect', () => {
        console.log('Connected to WebSocket server');
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
      });

      this.socket.onAny((event, ...args) => {
        console.log('Socket event received:', event, args);
      });

      // Handle role-related errors
      this.socket.on('error', (error: { message: string }) => {
        console.error('Socket error:', error.message);
      });
    }
    return this.socket;
  }

  // Stream Management
  startStream(stream: Stream) {
    this.socket?.emit('startStream', stream);
  }

  endStream(streamId: string) {
    this.socket?.emit('endStream', streamId);
  }

  // Viewer Management
  joinStream(streamId: string) {
    this.socket?.emit('joinStream', streamId);
  }

  leaveStream(streamId: string) {
    this.socket?.emit('leaveStream', streamId);
  }

  updateViewerCount(streamId: string, count: number) {
    this.socket?.emit('updateViewerCount', { streamId, count });
  }

  updatePreview(streamId: string, previewUrl: string) {
    console.log(`[SocketService] Emitting updatePreview for stream ${streamId}`);
    this.socket?.emit('updatePreview', { streamId, previewUrl });
    console.log('[SocketService] Emit complete');
  }

  onPreviewUpdated(callback: (data: { streamId: string; previewUrl: string }) => void) {
    this.socket?.on('previewUpdated', callback);
  }

  // Event Listeners
  onStreamStarted(callback: (stream: Stream) => void) {
    this.socket?.on('streamStarted', callback);
  }

  onStreamEnded(callback: (streamId: string) => void) {
    this.socket?.on('streamEnded', callback);
  }

  onViewerJoined(callback: (data: { streamId: string; count: number }) => void) {
    this.socket?.on('viewerJoined', callback);
  }

  onViewerLeft(callback: (data: { streamId: string; count: number }) => void) {
    this.socket?.on('viewerLeft', callback);
  }

  onViewerCountUpdated(callback: (data: { streamId: string; count: number }) => void) {
    this.socket?.on('viewerCountUpdated', callback);
  }

  // Error Handling
  onError(callback: (error: { message: string }) => void) {
    this.socket?.on('error', callback);
  }

  // Connection Management
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Helper method to remove event listeners
  removeListener(event: string, callback: (...args: any[]) => void) {
    this.socket?.off(event, callback);
  }
}

export const socketService = SocketService.getInstance();
