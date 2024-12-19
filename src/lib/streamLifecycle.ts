// src/lib/streamLifecycle.ts

import { agoraService } from './agoraService';
import { socketService } from './socketService';
import type { 
  IAgoraRTCClient, 
  ICameraVideoTrack, 
  IMicrophoneAudioTrack 
} from 'agora-rtc-sdk-ng';
import type { Stream } from '@/types/stream';
import { useStreamStore } from '@/lib/StreamStore';

// Core states
export const StreamState = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  LAUNCHING: 'launching',  // New intermediate state
  LIVE: 'live',
  ERROR: 'error',
  CLEANUP: 'cleanup'
} as const;

export type StreamStateType = typeof StreamState[keyof typeof StreamState];
export type StreamRole = 'host' | 'viewer';

// Connection states for different services
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface StreamTracks {
  video: ICameraVideoTrack | null;
  audio: IMicrophoneAudioTrack | null;
}

// Enhanced context with detailed states
interface StreamContext {
  state: StreamStateType;
  stream: Stream;
  client: IAgoraRTCClient | null;
  tracks: StreamTracks;
  videoContainer: HTMLDivElement | null;
  role: StreamRole;
  error?: Error;
  isPreviewEnabled?: boolean;
  
  // New state tracking
  agoraState: ConnectionState;
  socketState: ConnectionState;
  publishState: 'unpublished' | 'publishing' | 'published';
  lastStateUpdate: number;
  stateTransitions: Array<{
    from: StreamStateType;
    to: StreamStateType;
    timestamp: number;
  }>;
}

interface TransitionGuard {
  canTransition: (streamId: string) => Promise<boolean>;
  errorMessage: string;
}

interface StateTransitionConfig {
  from: StreamStateType;
  to: StreamStateType;
  guards: TransitionGuard[];
  rollback?: (streamId: string) => Promise<void>;
}

interface TransitionHistory {
  from: StreamStateType;
  to: StreamStateType;
  timestamp: number;
  success: boolean;
  error?: string;
}

export class StreamLifecycleManager {
  private contexts: Map<string, StreamContext> = new Map();
  private stateListeners: Map<string, Set<(state: StreamStateType) => void>> = new Map();
  private readonly STATE_TIMEOUT = 10000; // 10 seconds timeout for state transitions
  private readonly transitionConfigs: StateTransitionConfig[] = [];
  private transitionHistory: Map<string, TransitionHistory[]> = new Map();
  
  constructor() {
    this.initializeTransitionConfigs();
  }

  // Add helper method for adding configs
  private addTransitionConfig(
    from: StreamStateType,
    to: StreamStateType,
    guards: TransitionGuard[],
    rollback?: (streamId: string) => Promise<void>
  ) {
    this.transitionConfigs.push({ from, to, guards, rollback });
  }

  private initializeTransitionConfigs() {
    this.addTransitionConfig(
      StreamState.INITIALIZING,
      StreamState.READY,
      [
        {
          canTransition: async (streamId: string) => {
            const context = this.getContext(streamId);
            return context?.agoraState === 'connected' && 
                   context?.socketState === 'connected';
          },
          errorMessage: 'Services not connected'
        }
      ],
      async (streamId: string) => {
        await this.cleanup(streamId);
      }
    );

    this.addTransitionConfig(
      StreamState.READY,
      StreamState.LAUNCHING,
      [
        {
          canTransition: async (streamId: string) => {
            const context = this.getContext(streamId);
            return Boolean(context?.tracks.audio || context?.tracks.video);
          },
          errorMessage: 'No media tracks available'
        },
        {
          canTransition: async (streamId: string) => {
            const context = this.getContext(streamId);
            return context?.socketState === 'connected';
          },
          errorMessage: 'Socket not connected'
        }
      ]
    );

    this.addTransitionConfig(
      StreamState.LAUNCHING,
      StreamState.LIVE,
      [
        {
          canTransition: async (streamId: string) => {
            const context = this.getContext(streamId);
            return context?.publishState === 'published';
          },
          errorMessage: 'Media not published'
        }
      ],
      async (streamId: string) => {
        const context = this.getContext(streamId);
        if (context?.client) {
          try {
            await context.client.unpublish();
          } catch (error) {
            console.error('Rollback unpublish failed:', error);
          }
        }
      }
    );
  }

  private async validateTransition(
    streamId: string,
    from: StreamStateType,
    to: StreamStateType
  ): Promise<void> {
    const config = this.transitionConfigs.find(
      c => c.from === from && c.to === to
    );

    if (!config) {
      throw new Error(`Invalid transition from ${from} to ${to}`);
    }

    // Check all guards
    for (const guard of config.guards) {
      const canTransition = await guard.canTransition(streamId);
      if (!canTransition) {
        throw new Error(guard.errorMessage);
      }
    }
  }

  private async handleTransitionError(
    streamId: string,
    from: StreamStateType,
    to: StreamStateType,
    error: Error
  ): Promise<void> {
    // Log the failed transition
    const history = this.transitionHistory.get(streamId) || [];
    history.push({
      from,
      to,
      timestamp: Date.now(),
      success: false,
      error: error.message
    });
    this.transitionHistory.set(streamId, history);

    // Find and execute rollback if available
    const config = this.transitionConfigs.find(
      c => c.from === from && c.to === to
    );

    if (config?.rollback) {
      try {
        await config.rollback(streamId);
      } catch (rollbackError) {
        console.error(
          `Rollback failed for transition ${from} -> ${to}:`,
          rollbackError
        );
        // Force cleanup as last resort
        await this.cleanup(streamId);
      }
    }
  }

  // Add method to get transition history
  getTransitionHistory(streamId: string): TransitionHistory[] {
    return this.transitionHistory.get(streamId) || [];
  }

  // Allowed state transitions
  private readonly validTransitions: Record<StreamStateType, StreamStateType[]> = {
    [StreamState.INITIALIZING]: [StreamState.READY, StreamState.ERROR, StreamState.CLEANUP],
    [StreamState.READY]: [StreamState.LAUNCHING, StreamState.ERROR, StreamState.CLEANUP],
    [StreamState.LAUNCHING]: [StreamState.LIVE, StreamState.ERROR, StreamState.CLEANUP],
    [StreamState.LIVE]: [StreamState.ERROR, StreamState.CLEANUP],
    [StreamState.ERROR]: [StreamState.CLEANUP, StreamState.INITIALIZING],
    [StreamState.CLEANUP]: [StreamState.INITIALIZING] 
  };

  private async checkHostStatus(streamId: string): Promise<boolean> {
    const stream = useStreamStore.getState().getStream(streamId);
    if (!stream) return false;

    try {
      // First check socket connection
      const socket = socketService['socket'];
      if (!socket?.connected) {
        await socketService.connect();
      }

      // Then verify host is actually streaming
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => resolve(false), 5000); // 5s timeout

        socketService.on('streamStarted', (startedStream) => {
          if (startedStream.id === streamId) {
            clearTimeout(timeoutId);
            resolve(true);
          }
        });

        // Also check current state
        const context = this.contexts.get(streamId);
        if (context?.state === StreamState.LIVE) {
          clearTimeout(timeoutId);
          resolve(true);
        }
      });
    } catch (error) {
      console.error('[StreamLifecycle] Host status check failed:', error);
      return false;
    }
  }

  // Add this new method after checkHostStatus
  private async waitForFirstFrame(streamId: string): Promise<void> {
    const context = this.contexts.get(streamId);
    if (!context || !context.videoContainer) return;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout waiting for first frame'));
      }, 10000); // 10s timeout

      const checkVideo = () => {
        const video = context.videoContainer?.querySelector('video');
        if (video) {
          if (video.readyState >= 2) { // HAVE_CURRENT_DATA or better
            clearTimeout(timeoutId);
            resolve();
          } else {
            video.addEventListener('loadeddata', () => {
              clearTimeout(timeoutId);
              resolve();
            }, { once: true });
          }
        }
      };

      // Check immediately and also set up an observer
      checkVideo();
      
      if (context.videoContainer) {
        const observer = new MutationObserver(checkVideo);
        observer.observe(context.videoContainer, { childList: true, subtree: true });

        // Clean up observer when timeout occurs
        setTimeout(() => observer.disconnect(), 10000);
      }
    });
  }

  private getContext(streamId: string): StreamContext | undefined {
    return this.contexts.get(streamId);
  }

  private async validateStateTransition(
    context: StreamContext,
    targetState: StreamStateType
  ): Promise<boolean> {
    const currentState = context.state;
    
    // Check if transition is valid
    if (!this.validTransitions[currentState]?.includes(targetState)) {
      throw new Error(
        `Invalid state transition from ${currentState} to ${targetState}`
      );
    }

    // Additional validation based on target state
    switch (targetState) {
      case StreamState.READY:
        return context.agoraState === 'connected';
        
      case StreamState.LAUNCHING:
        return (
          context.agoraState === 'connected' &&
          context.socketState === 'connected' &&
          Boolean(context.tracks.audio || context.tracks.video)
        );
        
      case StreamState.LIVE:
        return (
          context.agoraState === 'connected' &&
          context.socketState === 'connected' &&
          context.publishState === 'published'
        );
        
      default:
        return true;
    }
  }

  // Update the existing setState method to use the new guards
  private async setState(
    streamId: string, 
    newState: StreamStateType,
    error?: Error
  ): Promise<void> {
    const context = this.contexts.get(streamId);
    if (!context) return;

    try {
      const currentState = context.state;
      
      // Validate the transition
      await this.validateTransition(streamId, currentState, newState);

      // Update context
      context.state = newState;
      context.lastStateUpdate = Date.now();

      // Record successful transition
      const history = this.transitionHistory.get(streamId) || [];
      history.push({
        from: currentState,
        to: newState,
        timestamp: Date.now(),
        success: true
      });
      this.transitionHistory.set(streamId, history);

      if (error) {
        context.error = error;
      }

      // Notify listeners
      this.stateListeners.get(streamId)?.forEach(listener => listener(newState));

    } catch (error) {
      await this.handleTransitionError(
        streamId,
        context.state,
        newState,
        error instanceof Error ? error : new Error('Transition failed')
      );
      throw error;
    }
  }

  private async handleError(streamId: string, error: Error): Promise<void> {
    console.error(`[StreamLifecycle] Error in stream ${streamId}:`, error);
    
    const context = this.contexts.get(streamId);
    if (!context) return;

    // Set error state
    await this.setState(streamId, StreamState.ERROR, error);

    // Attempt recovery based on error type and current state
    try {
      switch (context.state) {
        case StreamState.INITIALIZING:
        case StreamState.READY:
          // For early errors, try to reinitialize
          await this.cleanup(streamId);
          if (context.videoContainer) {
            await this.initializeStream(
              context.stream,
              context.videoContainer,
              context.role
            );
          }
          break;

        case StreamState.LAUNCHING:
        case StreamState.LIVE:
          // For runtime errors, try to restore connection
          await this.restoreConnection(streamId);
          break;

        default:
          // For other states, just cleanup
          await this.cleanup(streamId);
      }
    } catch (recoveryError) {
      console.error(
        `[StreamLifecycle] Recovery failed for stream ${streamId}:`,
        recoveryError
      );
      await this.cleanup(streamId);
    }
  }

  private async restoreConnection(streamId: string): Promise<void> {
    const context = this.contexts.get(streamId);
    if (!context) return;

    try {
      // First, check socket connection
      if (context.socketState !== 'connected') {
        await socketService.connect();
      }

      // Then check Agora connection
      if (context.agoraState !== 'connected' && context.client) {
        // Re-join with existing credentials
        const response = await fetch(`/api/agora-token?channel=${streamId}`);
        if (!response.ok) throw new Error('Failed to fetch token');
        const data = await response.json();
        
        await context.client.join(
          process.env.NEXT_PUBLIC_AGORA_APP_ID!,
          streamId,
          data.token,
          data.uid
        );
      }

      // For hosts, republish tracks if necessary
      if (
        context.role === 'host' &&
        context.publishState !== 'published' &&
        (context.tracks.audio || context.tracks.video)
      ) {
        const tracks = [];
        if (context.tracks.audio) tracks.push(context.tracks.audio);
        if (context.tracks.video) tracks.push(context.tracks.video);
        
        if (context.client && tracks.length > 0) {
          await context.client.publish(tracks);
          context.publishState = 'published';
        }
      }

      // If everything is restored, return to appropriate state
      if (context.role === 'host') {
        await this.setState(streamId, StreamState.LIVE);
      } else {
        await this.setState(streamId, StreamState.READY);
      }

    } catch (error) {
      console.error(`[StreamLifecycle] Restore failed:`, error);
      throw error;
    }
  }

  async cleanup(streamId: string): Promise<void> {
    console.log('[StreamLifecycle] Starting cleanup...');
    
    const context = this.contexts.get(streamId);
    if (!context) return;

    try {
      // Set state to cleanup to prevent new operations
      await this.setState(streamId, StreamState.CLEANUP);

      // Clean up tracks
      if (context.tracks.video) {
        try {
          context.tracks.video.stop();
          await context.tracks.video.close();
        } catch (error) {
          console.error('[StreamLifecycle] Video cleanup error:', error);
        }
      }

      if (context.tracks.audio) {
        try {
          context.tracks.audio.stop();
          await context.tracks.audio.close();
        } catch (error) {
          console.error('[StreamLifecycle] Audio cleanup error:', error);
        }
      }

      // Clean up client
      if (context.client) {
        try {
          // Remove all event listeners
          context.client.removeAllListeners();
          // Only try to leave if connected
          if (context.agoraState === 'connected') {
            await context.client.leave();
          }
        } catch (error) {
          console.error('[StreamLifecycle] Client cleanup error:', error);
        }
      }

      // Clear context and listeners
      this.contexts.delete(streamId);
      this.stateListeners.delete(streamId);

    } catch (error) {
      console.error('[StreamLifecycle] Cleanup error:', error);
      throw error;
    }
  }

  async initializeStream(
    stream: Stream,
    videoContainer: HTMLDivElement,
    role: StreamRole = 'host'
  ): Promise<void> {
    const streamId = stream.id;

    // Create new context with initial state
    this.contexts.set(streamId, {
      state: StreamState.INITIALIZING,
      stream,
      client: null,
      tracks: { video: null, audio: null },
      videoContainer,
      role,
      isPreviewEnabled: false,
      agoraState: 'disconnected',
      socketState: 'disconnected',
      publishState: 'unpublished',
      lastStateUpdate: Date.now(),
      stateTransitions: []
    });

    try {
      // First ensure socket connection
      await socketService.connect();
      const context = this.contexts.get(streamId);
      if (!context) return;
      context.socketState = 'connected';

      // Initialize Agora client
      const client = await agoraService.initializeClient({
        role: role === 'host' ? 'host' : 'audience',
        streamId
      });

      if (!this.contexts.has(streamId)) return; // Check if still valid
      context.client = client;
      context.agoraState = 'connected';

      // For hosts, initialize tracks
      if (role === 'host') {
        const { audioTrack, videoTrack } = await agoraService.initializeHostTracks();
        
        if (!this.contexts.has(streamId)) {
          // Clean up tracks if context was removed
          audioTrack?.close();
          videoTrack?.close();
          return;
        }

        context.tracks = {
          video: videoTrack || null,
          audio: audioTrack || null
        };

        // Play video preview if available
        if (videoTrack && videoContainer) {
          await videoTrack.play(videoContainer);
          context.isPreviewEnabled = true;
        }
      }

      // Set up event listeners
      this.setupEventListeners(streamId);

      // Transition to ready state
      await this.setState(streamId, StreamState.READY);

    } catch (error) {
      await this.handleError(streamId, error instanceof Error ? error : new Error('Stream initialization failed'));
      throw error;
    }
  }

  async connectViewer(stream: Stream, container: HTMLDivElement): Promise<void> {
    const streamId = stream.id;
    console.log('[StreamLifecycle] Starting viewer connection:', streamId);

    try {
      // First verify host is streaming
      const isHostActive = await this.checkHostStatus(streamId);
      if (!isHostActive) {
        throw new Error('Host is not active');
      }

      // Then initialize stream with viewer role
      await this.initializeStream(stream, container, 'viewer');

      // Start stream and wait for first frame
      await this.startStream(streamId);
      await this.waitForFirstFrame(streamId);

      // If we get here, connection is fully established
      await this.setState(streamId, StreamState.LIVE);

    } catch (error) {
      console.error('[StreamLifecycle] Viewer connection failed:', error);
      // Ensure cleanup on failure
      await this.cleanup(streamId);
      throw error;
    }
  }

  private setupEventListeners(streamId: string): void {
    const context = this.contexts.get(streamId);
    if (!context || !context.client) return;

    // Agora connection state
    context.client.on('connection-state-change', (state: string) => {
      const context = this.contexts.get(streamId);
      if (!context) return;

      // Map Agora connection states to our internal states
      const stateMap: Record<string, ConnectionState> = {
        'CONNECTING': 'connecting',
        'CONNECTED': 'connected',
        'DISCONNECTED': 'disconnected',
        'RECONNECTING': 'connecting',
        'DISCONNECTING': 'disconnected'
      };

      const mappedState = stateMap[state] || 'error';
      context.agoraState = mappedState;

      if (mappedState === 'error') {
        this.handleError(
          streamId,
          new Error('Agora connection failed')
        ).catch(console.error);
      }
    });

    // Socket reconnection handling
    socketService.on('disconnect', () => {
      const context = this.contexts.get(streamId);
      if (!context) return;
      context.socketState = 'disconnected';
    });

    socketService.on('connect', () => {
      const context = this.contexts.get(streamId);
      if (!context) return;
      context.socketState = 'connected';
    });

    // Error handling
    context.client.on('error', (err: Error) => {
      this.handleError(streamId, err).catch(console.error);
    });
  }

  async startStream(streamId: string): Promise<void> {
    const context = this.getContext(streamId);
    if (!context || context.state !== StreamState.READY) {
      throw new Error('Stream not ready to start');
    }

    try {
      // First transition to launching state
      await this.setState(streamId, StreamState.LAUNCHING);

      if (context.role === 'host') {
        // Prepare tracks for publishing
        const tracks = [];
        if (context.tracks.audio) tracks.push(context.tracks.audio);
        if (context.tracks.video) tracks.push(context.tracks.video);

        if (context.client && tracks.length > 0) {
          // Update publish state
          context.publishState = 'publishing';
          
          // Publish tracks
          await context.client.publish(tracks);
          context.publishState = 'published';

          // Broadcast stream
          const store = useStreamStore.getState();
          await store.broadcastStream(streamId);

          // Finally transition to live state
          await this.setState(streamId, StreamState.LIVE);
        }
      } else {
        // For viewers, we just transition to live state
        await this.setState(streamId, StreamState.LIVE);
      }
    } catch (error) {
    await this.handleError(
        streamId, 
        error instanceof Error ? error : new Error('Failed to start stream')
      );
      await this.cleanup(streamId);
      throw error;
    }
  }

  async handleMediaFailure(streamId: string, type: 'audio' | 'video'): Promise<void> {
    const context = this.getContext(streamId);
    if (!context) return;

    try {
      // Remove failed track
      if (type === 'audio' && context.tracks.audio) {
        await context.tracks.audio.close();
        context.tracks.audio = null;
      } else if (type === 'video' && context.tracks.video) {
        await context.tracks.video.close();
        context.tracks.video = null;
      }

      // If in live state, need to handle republishing
      if (context.state === StreamState.LIVE) {
        const remainingTracks = [];
        if (context.tracks.audio) remainingTracks.push(context.tracks.audio);
        if (context.tracks.video) remainingTracks.push(context.tracks.video);

        if (context.client && remainingTracks.length > 0) {
          await context.client.unpublish();
          context.publishState = 'publishing';
          await context.client.publish(remainingTracks);
          context.publishState = 'published';
        }
      }
    } catch (error) {
      console.error(`[StreamLifecycle] Failed to handle ${type} failure:`, error);
      await this.handleError(
        streamId,
        error instanceof Error ? error : new Error(`Failed to handle ${type} failure`)
      );
    }
  }

  isPreviewEnabled(streamId: string): boolean {
    return this.contexts.get(streamId)?.isPreviewEnabled ?? false;
  }

  getStreamState(streamId: string): StreamStateType | undefined {
    return this.contexts.get(streamId)?.state;
  }

  onStateChange(streamId: string, callback: (state: StreamStateType) => void): () => void {
    const listeners = this.stateListeners.get(streamId) || new Set();
    listeners.add(callback);
    this.stateListeners.set(streamId, listeners);

    return () => {
      const listeners = this.stateListeners.get(streamId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.stateListeners.delete(streamId);
        }
      }
    };
  }

  // State check utilities
  isStreamActive(streamId: string): boolean {
    const context = this.contexts.get(streamId);
    if (!context) return false;
    
    const activeStates = [
      StreamState.READY,
      StreamState.LAUNCHING,
      StreamState.LIVE
    ] as const;
    
    return activeStates.includes(context.state as typeof activeStates[number]);
  }

  canStartStream(streamId: string): boolean {
    const context = this.contexts.get(streamId);
    if (!context) return false;
    return (
      context.state === StreamState.READY &&
      context.agoraState === 'connected' &&
      context.socketState === 'connected'
    );
  }

  getStreamError(streamId: string): Error | undefined {
    return this.contexts.get(streamId)?.error;
  }

  // Debug utilities
  getDebugInfo(streamId: string): any {
    const context = this.contexts.get(streamId);
    if (!context) return null;

    return {
      streamId,
      state: context.state,
      agoraState: context.agoraState,
      socketState: context.socketState,
      publishState: context.publishState,
      hasAudioTrack: !!context.tracks.audio,
      hasVideoTrack: !!context.tracks.video,
      isPreviewEnabled: context.isPreviewEnabled,
      error: context.error?.message,
      stateTransitions: context.stateTransitions,
      lastStateUpdate: context.lastStateUpdate
    };
  }

  public getConnectionStates(streamId: string): { agora: string; socket: string } {
    const context = this.contexts.get(streamId);
    if (!context) return { agora: 'DISCONNECTED', socket: 'disconnected' };
    
    return {
      agora: context.agoraState.toUpperCase(),
      socket: context.socketState
    };
  }

  public addStateListener(streamId: string, listener: (state: StreamStateType) => void): () => void {
    let listeners = this.stateListeners.get(streamId);
    if (!listeners) {
      listeners = new Set();
      this.stateListeners.set(streamId, listeners);
    }
    
    listeners.add(listener);
    
    return () => {
      const listeners = this.stateListeners.get(streamId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.stateListeners.delete(streamId);
        }
      }
    };
  }

  public getDiagnostics(streamId: string): { error?: { message: string } } | undefined {
    const context = this.contexts.get(streamId);
    if (!context) return undefined;
    
    return context.error ? { error: { message: context.error.message } } : undefined;
  }
}

// Export singleton instance
export const streamLifecycle = new StreamLifecycleManager();