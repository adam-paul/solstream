// src/lib/socketService.ts

import { io, Socket } from 'socket.io-client';
import { Stream } from '@/types/stream';
import { sessionManager } from './sessionManager';

// Socket Event Types
interface SocketEvents {
  // Server -> Client events
  streamStarted: (stream: Stream) => void;
  streamEnded: (streamId: string) => void;
  viewerJoined: (data: { streamId: string; count: number }) => void;
  viewerLeft: (data: { streamId: string; count: number }) => void;
  viewerCountUpdated: (data: { streamId: string; count: number }) => void;
  previewUpdated: (data: { streamId: string; previewUrl: string }) => void;
  roleChanged: (data: { streamId: string; role: 'host' | 'viewer' | null }) => void;
  error: (error: { message: string }) => void;
  
  // Client -> Server events
  startStream: (stream: Stream) => void;
  endStream: (streamId: string) => void;
  joinStream: (streamId: string) => void;
  leaveStream: (streamId: string) => void;
  updateViewerCount: (data: { streamId: string; count: number }) => void;
  updatePreview: (data: { streamId: string; previewUrl: string }) => void;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface ConnectionStatus {
  state: ConnectionState;
  error?: Error;
  lastConnected?: Date;
  reconnectAttempt?: number;
}

class SocketService {
  private socket: Socket | null = null;
  private static instance: SocketService;
  private connectionStatus: ConnectionStatus = { state: 'disconnected' };
  private eventListeners: Map<keyof SocketEvents, Set<(data: any) => void>> = new Map();
  private reconnectTimer?: NodeJS.Timeout;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_INTERVAL = 5000; // 5 seconds

  private constructor() {
    if (typeof window === 'undefined') return;
    this.setupEventListeners();
  }

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  private setupEventListeners() {
    // Initialize empty Sets for all event types
    Object.keys(this.eventListeners).forEach(event => {
      this.eventListeners.set(event as keyof SocketEvents, new Set());
    });
  }

  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  async connect(): Promise<Socket> {
    if (this.socket?.connected) {
      return this.socket;
    }

    return new Promise((resolve, reject) => {
      try {
        this.updateConnectionStatus('connecting');

        this.socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001', {
          transports: ['websocket'],
          secure: true,
          reconnection: false, // We'll handle reconnection manually
          query: {
            userId: sessionManager.getUserId()
          }
        });

        // Connection event handlers
        this.socket.on('connect', () => {
          this.updateConnectionStatus('connected');
          this.connectionStatus.lastConnected = new Date();
          this.connectionStatus.reconnectAttempt = 0;
          resolve(this.socket!);
        });

        this.socket.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          this.handleConnectionError(error);
          reject(error);
        });

        this.socket.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          this.handleDisconnect(reason);
        });

        // Debug logging in development
        if (process.env.NODE_ENV === 'development') {
          this.socket.onAny((event, ...args) => {
            console.log('Socket event:', event, args);
          });
        }

      } catch (error) {
        console.error('Socket initialization error:', error);
        this.handleConnectionError(error as Error);
        reject(error);
      }
    });
  }

  private updateConnectionStatus(state: ConnectionState, error?: Error) {
    this.connectionStatus = {
      ...this.connectionStatus,
      state,
      error,
      ...(state === 'connected' && { lastConnected: new Date() })
    };
    
    // Notify any listeners about the connection status change
    this.notifyEventListeners('connectionStatusChanged', this.connectionStatus);
  }

  private handleConnectionError(error: Error) {
    this.updateConnectionStatus('error', error);
    if (this.connectionStatus.reconnectAttempt === undefined) {
      this.connectionStatus.reconnectAttempt = 0;
    }
    
    if (this.connectionStatus.reconnectAttempt < this.MAX_RECONNECT_ATTEMPTS) {
      this.scheduleReconnect();
    }
  }

  private handleDisconnect(reason: string) {
    this.updateConnectionStatus('disconnected');
    if (reason === 'io server disconnect') {
      // The disconnection was initiated by the server, we shouldn't attempt to reconnect
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      if (this.connectionStatus.reconnectAttempt! < this.MAX_RECONNECT_ATTEMPTS) {
        this.connectionStatus.reconnectAttempt!++;
        this.updateConnectionStatus('reconnecting');
        this.connect().catch(console.error);
      }
    }, this.RECONNECT_INTERVAL);
  }

  // Strongly typed event emitters
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

  updateViewerCount(streamId: string, count: number): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('updateViewerCount', { streamId, count });
  }

  updatePreview(streamId: string, previewUrl: string): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    console.log(`[SocketService] Emitting updatePreview for stream ${streamId}`);
    this.socket.emit('updatePreview', { streamId, previewUrl });
  }

  // Strongly typed event listeners
  onStreamStarted(callback: SocketEvents['streamStarted']): () => void {
    return this.addEventHandler('streamStarted', callback);
  }

  onStreamEnded(callback: SocketEvents['streamEnded']): () => void {
    return this.addEventHandler('streamEnded', callback);
  }

  onViewerJoined(callback: SocketEvents['viewerJoined']): () => void {
    return this.addEventHandler('viewerJoined', callback);
  }

  onViewerLeft(callback: SocketEvents['viewerLeft']): () => void {
    return this.addEventHandler('viewerLeft', callback);
  }

  onViewerCountUpdated(callback: SocketEvents['viewerCountUpdated']): () => void {
    return this.addEventHandler('viewerCountUpdated', callback);
  }

  onPreviewUpdated(callback: SocketEvents['previewUpdated']): () => void {
    return this.addEventHandler('previewUpdated', callback);
  }

  onRoleChanged(callback: SocketEvents['roleChanged']): () => void {
    return this.addEventHandler('roleChanged', callback);
  }

  onError(callback: SocketEvents['error']): () => void {
    return this.addEventHandler('error', callback);
  }

  private addEventHandler<T extends keyof SocketEvents>(
    event: T,
    callback: SocketEvents[T]
  ): () => void {
    if (!this.socket) {
      throw new Error('Socket not initialized');
    }

    this.socket.on(event, callback as any);
    const listeners = this.eventListeners.get(event) || new Set();
    listeners.add(callback);
    this.eventListeners.set(event, listeners);

    // Return cleanup function
    return () => {
      if (this.socket) {
        this.socket.off(event, callback as any);
        const listeners = this.eventListeners.get(event);
        if (listeners) {
          listeners.delete(callback);
        }
      }
    };
  }

  private notifyEventListeners(event: string, data: any) {
    const listeners = this.eventListeners.get(event as keyof SocketEvents);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.updateConnectionStatus('disconnected');
    this.eventListeners.clear();
  }
}

export const socketService = SocketService.getInstance();
