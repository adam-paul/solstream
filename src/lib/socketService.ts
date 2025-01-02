// src/lib/socketService.ts

import { io, Socket } from 'socket.io-client';
import { Stream } from '@/types/stream';
import { sessionManager } from './sessionManager';
import { ChatMessage } from '@/types/stream';

interface ServerToClientEvents {
  streamStarted: (stream: Stream) => void;
  streamEnded: (streamId: string) => void;
  viewerJoined: (data: { streamId: string; count: number }) => void;
  viewerLeft: (data: { streamId: string; count: number }) => void;
  roleChanged: (data: { streamId: string; role: 'host' | 'audience' | null }) => void;
  error: (error: { message: string; statusCode?: number }) => void;
  streamLiveStatusChanged: (data: { streamId: string; isLive: boolean }) => void;
  chatMessageReceived: (data: { streamId: string; message: ChatMessage }) => void;
  chatHistoryReceived: (data: { streamId: string; messages: ChatMessage[] }) => void;
}

interface ClientToServerEvents {
  startStream: (stream: Stream) => void;
  endStream: (streamId: string) => void;
  joinStream: (streamId: string) => void;
  leaveStream: (streamId: string) => void;
  updateStreamLiveStatus: (data: { streamId: string; isLive: boolean }) => void;
  sendChatMessage: (data: { streamId: string; content: string }) => void;
  requestChatHistory: (streamId: string) => void;
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

  sendChatMessage(data: { streamId: string; content: string }): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('sendChatMessage', data);
  }

  requestChatHistory(streamId: string): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('requestChatHistory', streamId);
  }

  onChatMessageReceived(callback: ServerToClientEvents['chatMessageReceived']): () => void {
    if (!this.socket) return () => {};
    console.log('Setting up chat message listener');
    this.socket.on('chatMessageReceived', (data) => {
      console.log('Received chat message:', data);
      callback(data);
    });
    return () => this.socket?.off('chatMessageReceived', callback);
  }

  onChatHistoryReceived(callback: ServerToClientEvents['chatHistoryReceived']): () => void {
    if (!this.socket) return () => {};
    this.socket.on('chatHistoryReceived', callback);
    return () => this.socket?.off('chatHistoryReceived', callback);
  }

  updateStreamLiveStatus(data: { streamId: string; isLive: boolean }): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('updateStreamLiveStatus', data);
  }

  onStreamLiveStatusChanged(callback: ServerToClientEvents['streamLiveStatusChanged']): () => void {
    if (!this.socket) return () => {};
    this.socket.on('streamLiveStatusChanged', callback);
    return () => this.socket?.off('streamLiveStatusChanged', callback);
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
