// src/lib/socketService.ts

import { io, Socket } from 'socket.io-client';
import { Stream } from '@/types/stream';
import { sessionManager } from './sessionManager';

interface ServerToClientEvents {
  streamStarted: (stream: Stream) => void;
  streamEnded: (streamId: string) => void;
  viewerJoined: (data: { streamId: string; count: number }) => void;
  viewerLeft: (data: { streamId: string; count: number }) => void;
  roleChanged: (data: { streamId: string; role: 'host' | 'viewer' | null }) => void;
  streamPreview: (data: { streamId: string; preview: string }) => void;
  error: (error: { message: string; statusCode?: number }) => void;
}

interface ClientToServerEvents {
  startStream: (stream: Stream) => void;
  endStream: (streamId: string) => void;
  joinStream: (streamId: string) => void;
  leaveStream: (streamId: string) => void;
  streamPreview: (data: { streamId: string; preview: string }) => void;
}

export class SocketService {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private static instance: SocketService;

  private constructor() {
    if (typeof window === 'undefined') return;
  }

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  async connect(): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
    if (this.socket?.connected) {
      return this.socket;
    }

    return new Promise((resolve, reject) => {
      this.socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001', {
        transports: ['websocket'],
        secure: true,
        query: {
          userId: sessionManager.getUserId()
        }
      }) as Socket<ServerToClientEvents, ClientToServerEvents>;

      this.socket.on('connect', () => {
        console.log('WebSocket Connected');
        resolve(this.socket!);
      });

      this.socket.on('connect_error', (error) => {
        reject(error);
      });

      setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
    });
  }

  startStream(stream: Stream): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('startStream', stream);
  }

  endStream(streamId: string): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('endStream', streamId);
  }

  joinStream(streamId: string): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('joinStream', streamId);
  }

  leaveStream(streamId: string): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('leaveStream', streamId);
  }

  updatePreview(streamId: string, preview: string): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('streamPreview', { streamId, preview });
  }

  onStreamStarted(callback: ServerToClientEvents['streamStarted']): () => void {
    if (!this.socket) return () => {};
    this.socket.on('streamStarted', callback);
    return () => this.socket?.off('streamStarted', callback);
  }

  onStreamEnded(callback: ServerToClientEvents['streamEnded']): () => void {
    if (!this.socket) return () => {};
    this.socket.on('streamEnded', callback);
    return () => this.socket?.off('streamEnded', callback);
  }

  onViewerJoined(callback: ServerToClientEvents['viewerJoined']): () => void {
    if (!this.socket) return () => {};
    this.socket.on('viewerJoined', callback);
    return () => this.socket?.off('viewerJoined', callback);
  }

  onViewerLeft(callback: ServerToClientEvents['viewerLeft']): () => void {
    if (!this.socket) return () => {};
    this.socket.on('viewerLeft', callback);
    return () => this.socket?.off('viewerLeft', callback);
  }

  onPreview(callback: ServerToClientEvents['streamPreview']): () => void {
    if (!this.socket) return () => {};
    this.socket.on('streamPreview', callback);
    return () => this.socket?.off('streamPreview', callback);
  }

  onRoleChanged(callback: ServerToClientEvents['roleChanged']): () => void {
    if (!this.socket) return () => {};
    this.socket.on('roleChanged', callback);
    return () => this.socket?.off('roleChanged', callback);
  }

  onError(callback: ServerToClientEvents['error']): () => void {
    if (!this.socket) return () => {};
    this.socket.on('error', callback);
    return () => this.socket?.off('error', callback);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = SocketService.getInstance();
