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

  private getContext(streamId: string): StreamContext | undefined {
    return this.contexts.get(streamId);
  }

  private setState(streamId: string, newState: StreamStateType, error?: Error) {
    const context = this.contexts.get(streamId);
    if (!context) return;

    context.state = newState;
    if (error) context.error = error;

    // Notify listeners
    this.stateListeners.get(streamId)?.forEach(listener => listener(newState));
  }

  async cleanup(streamId: string): Promise<void> {
    try {
      const context = this.contexts.get(streamId);
      if (!context) return;

      // Clean up tracks
      if (context.tracks.video) {
        await context.tracks.video.stop();
        await context.tracks.video.close();
      }
      if (context.tracks.audio) {
        await context.tracks.audio.stop();
        await context.tracks.audio.close();
      }

      // Clean up client
      if (context.client) {
        await context.client.leave();
      }

      // Clear context
      this.contexts.delete(streamId);
      this.stateListeners.delete(streamId);
    } catch (error) {
      console.error('[StreamLifecycle] Cleanup error:', error);
      throw error;
    }
  }

  isPreviewEnabled(streamId: string): boolean {
    return this.contexts.get(streamId)?.isPreviewEnabled ?? false;
  }

  async initializeStream(stream: Stream, videoContainer: HTMLDivElement, role: StreamRole = 'host'): Promise<void> {
    const streamId = stream.id;

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

      const context = this.contexts.get(streamId);
      if (!context) return;
      context.client = client;

      if (role === 'host') {
        const { audioTrack, videoTrack } = await agoraService.initializeHostTracks();
        context.tracks = {
          video: videoTrack || null,
          audio: audioTrack || null
        };

        if (videoTrack && videoContainer) {
          await videoTrack.play(videoContainer);
          context.isPreviewEnabled = true;
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
          
          // Broadcast stream when going live
          const store = useStreamStore.getState();
          await store.broadcastStream(streamId);
          
          this.setState(streamId, StreamState.LIVE);
        }
      } else {
        this.setState(streamId, StreamState.LIVE);
      }
    } catch (error) {
      this.setState(streamId, StreamState.ERROR, error instanceof Error ? error : new Error('Failed to start stream'));
      await this.cleanup(streamId);
      throw error;
    }
  }

  // ... rest of the class with simplified methods
}

export const streamLifecycle = new StreamLifecycleManager(); 