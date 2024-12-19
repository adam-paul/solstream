import { agoraService } from './agoraService';
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import type { Stream } from '@/types/stream';
import { useStreamStore } from '@/lib/StreamStore';

export const StreamState = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  LIVE: 'live',
  ERROR: 'error',
  CLEANUP: 'cleanup'
} as const;

export type StreamStateType = typeof StreamState[keyof typeof StreamState];
export type StreamRole = 'host' | 'viewer';

interface StreamTracks {
  video: ICameraVideoTrack | null;
  audio: IMicrophoneAudioTrack | null;
}

interface StreamContext {
  state: StreamStateType;
  stream: Stream;
  client: IAgoraRTCClient | null;
  tracks: StreamTracks;
  videoContainer: HTMLDivElement | null;
  role: StreamRole;
  error?: Error;
  isPreviewEnabled?: boolean;
}

export class StreamLifecycleManager {
  private contexts: Map<string, StreamContext> = new Map();
  private stateListeners: Map<string, Set<(state: StreamStateType) => void>> = new Map();
  private cleanupPromises: Map<string, Promise<void>> = new Map();

  private getContext(streamId: string): StreamContext | undefined {
    return this.contexts.get(streamId);
  }

  private setState(streamId: string, newState: StreamStateType, error?: Error) {
    const context = this.getContext(streamId);
    if (!context) return;

    const oldState = context.state;
    context.state = newState;
    if (error) context.error = error;

    // Handle state-specific logic
    if (newState === StreamState.LIVE && oldState !== StreamState.LIVE) {
      context.isPreviewEnabled = true;
    } else if (newState === StreamState.CLEANUP) {
      context.isPreviewEnabled = false;
    }

    // Notify listeners
    this.stateListeners.get(streamId)?.forEach(listener => listener(newState));
  }

  private async cleanupTracks(tracks: StreamTracks) {
    try {
      if (tracks.video) {
        await tracks.video.stop();
        await tracks.video.close();
      }
      if (tracks.audio) {
        await tracks.audio.stop();
        await tracks.audio.close();
      }
    } catch (error) {
      console.error('[StreamLifecycle] Track cleanup error:', error);
    }
  }

  async initializeStream(stream: Stream, videoContainer: HTMLDivElement, role: StreamRole = 'host'): Promise<void> {
    const streamId = stream.id;

    // Wait for any ongoing cleanup
    const existingCleanup = this.cleanupPromises.get(streamId);
    if (existingCleanup) {
      await existingCleanup.catch(() => {});
    }

    // Create new context
    this.contexts.set(streamId, {
      state: StreamState.INITIALIZING,
      stream,
      client: null,
      tracks: { video: null, audio: null },
      videoContainer,
      role,
      isPreviewEnabled: false
    });

    try {
      // Initialize Agora client
      const client = await agoraService.initializeClient({
        role: role === 'host' ? 'host' : 'audience',
        streamId
      });

      const context = this.getContext(streamId);
      if (!context) return;
      context.client = client;

      if (role === 'host') {
        // For hosts, initialize tracks with retries
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            const { audioTrack, videoTrack } = await agoraService.initializeHostTracks();
            context.tracks = {
              video: videoTrack || null,
              audio: audioTrack || null
            };

            // Play video preview for host if video track exists
            if (videoTrack && videoContainer) {
              try {
                await videoTrack.play(videoContainer);
                context.isPreviewEnabled = true;
              } catch (playError) {
                console.error('[StreamLifecycle] Failed to play video preview:', playError);
                // Don't throw here - we still want to continue with the stream
              }
            }
            
            break;
          } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      this.setState(streamId, StreamState.READY);
    } catch (error) {
      this.setState(streamId, StreamState.ERROR, error instanceof Error ? error : new Error('Stream initialization failed'));
      await this.cleanup(streamId);
      throw error;
    }
  }

  async startStream(streamId: string): Promise<void> {
    const context = this.getContext(streamId);
    if (!context || context.state !== StreamState.READY) {
      throw new Error('Stream not ready to start');
    }

    try {
      if (context.role === 'host') {
        const tracks = [];
        if (context.tracks.audio) tracks.push(context.tracks.audio);
        if (context.tracks.video) tracks.push(context.tracks.video);

        if (context.client && tracks.length > 0) {
          await context.client.publish(tracks);
          this.setState(streamId, StreamState.LIVE);
          
          // Broadcast to server only when actually going live
          const store = useStreamStore.getState();
          await store.broadcastStream(streamId);
        } else {
          throw new Error('No tracks available to publish');
        }
      } else {
        // For viewers, we just mark the stream as live
        this.setState(streamId, StreamState.LIVE);
      }
    } catch (error) {
      this.setState(streamId, StreamState.ERROR, error instanceof Error ? error : new Error('Failed to start stream'));
      await this.cleanup(streamId);
      throw error;
    }
  }

  async cleanup(streamId: string): Promise<void> {
    // Create cleanup promise
    const cleanupPromise = (async () => {
      this.setState(streamId, StreamState.CLEANUP);

      try {
        const context = this.getContext(streamId);
        if (!context) return;

        // Clean up tracks only if we're the host
        if (context.role === 'host') {
          await this.cleanupTracks(context.tracks);
        }

        // Clear video container safely
        if (context.videoContainer && context.videoContainer.parentNode) {
          while (context.videoContainer.firstChild) {
            context.videoContainer.removeChild(context.videoContainer.firstChild);
          }
        }

        // Clean up Agora client
        if (context.client) {
          await context.client.leave();
        }

        // Remove context and listeners
        this.contexts.delete(streamId);
        this.stateListeners.delete(streamId);
      } catch (error) {
        console.error('[StreamLifecycle] Cleanup error:', error);
        throw error;
      } finally {
        this.cleanupPromises.delete(streamId);
      }
    })();

    // Store cleanup promise
    this.cleanupPromises.set(streamId, cleanupPromise);

    // Wait for cleanup to complete
    await cleanupPromise;
  }

  async toggleTrack(streamId: string, type: 'video' | 'audio', enabled: boolean): Promise<void> {
    const context = this.getContext(streamId);
    if (!context) return;

    const track = type === 'video' ? context.tracks.video : context.tracks.audio;
    if (track) {
      if (enabled) {
        await track.setEnabled(true);
      } else {
        await track.setEnabled(false);
      }
    }
  }

  async switchDevice(streamId: string, type: 'camera' | 'microphone', deviceId: string): Promise<void> {
    const context = this.getContext(streamId);
    if (!context) return;

    try {
      if (type === 'camera' && context.tracks.video) {
        let newTrack: ICameraVideoTrack;
        try {
          newTrack = await agoraService.switchCamera(deviceId);
        } catch (trackError) {
          const errorMessage = trackError instanceof Error ? trackError.message : 'Unknown camera switch error';
          throw new Error(`Failed to create new camera track: ${errorMessage}`);
        }
        
        if (context.client) {
          await context.client.unpublish([context.tracks.video]);
          await context.client.publish([newTrack]);
          context.tracks.video = newTrack;
        }
      } else if (type === 'microphone' && context.tracks.audio) {
        let newTrack: IMicrophoneAudioTrack;
        try {
          newTrack = await agoraService.switchMicrophone(deviceId);
        } catch (trackError) {
          const errorMessage = trackError instanceof Error ? trackError.message : 'Unknown microphone switch error';
          throw new Error(`Failed to create new microphone track: ${errorMessage}`);
        }
        
        if (context.client) {
          await context.client.unpublish([context.tracks.audio]);
          await context.client.publish([newTrack]);
          context.tracks.audio = newTrack;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[StreamLifecycle] Failed to switch ${type}:`, errorMessage);
      throw error;
    }
  }

  onStateChange(streamId: string, listener: (state: StreamStateType) => void): () => void {
    if (!this.stateListeners.has(streamId)) {
      this.stateListeners.set(streamId, new Set());
    }
    
    this.stateListeners.get(streamId)?.add(listener);

    return () => {
      this.stateListeners.get(streamId)?.delete(listener);
    };
  }

  getCurrentState(streamId: string): StreamStateType | undefined {
    return this.getContext(streamId)?.state;
  }

  getError(streamId: string): Error | undefined {
    return this.getContext(streamId)?.error;
  }

  getRole(streamId: string): StreamRole | undefined {
    return this.getContext(streamId)?.role;
  }

  isPreviewEnabled(streamId: string): boolean {
    return this.getContext(streamId)?.isPreviewEnabled ?? false;
  }
}

export const streamLifecycle = new StreamLifecycleManager(); 