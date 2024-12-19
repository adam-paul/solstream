import { agoraService } from './agoraService';
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import type { Stream } from '@/types/stream';

export const StreamState = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  LIVE: 'live',
  ERROR: 'error',
  CLEANUP: 'cleanup'
} as const;

export type StreamStateType = typeof StreamState[keyof typeof StreamState];

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
  error?: Error;
}

export class StreamLifecycleManager {
  private contexts: Map<string, StreamContext> = new Map();
  private stateListeners: Map<string, Set<(state: StreamStateType) => void>> = new Map();

  private getContext(streamId: string): StreamContext | undefined {
    return this.contexts.get(streamId);
  }

  private setState(streamId: string, newState: StreamStateType, error?: Error) {
    const context = this.getContext(streamId);
    if (!context) return;

    context.state = newState;
    if (error) context.error = error;

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

  async initializeStream(stream: Stream, videoContainer: HTMLDivElement): Promise<void> {
    const streamId = stream.id;

    // Create new context with empty tracks
    this.contexts.set(streamId, {
      state: StreamState.INITIALIZING,
      stream,
      client: null,
      tracks: { video: null, audio: null },
      videoContainer
    });

    try {
      // Request permissions first
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      // Initialize Agora client
      const client = await agoraService.initializeClient({
        role: 'host',
        streamId
      });

      // Initialize tracks
      const { audioTrack, videoTrack } = await agoraService.initializeHostTracks();

      // Update context
      const context = this.getContext(streamId);
      if (context) {
        context.client = client;
        context.tracks = {
          video: videoTrack || null,
          audio: audioTrack || null
        };

        // Play video preview
        if (videoTrack) {
          await videoTrack.play(videoContainer);
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
      const tracks = [];
      if (context.tracks.audio) tracks.push(context.tracks.audio);
      if (context.tracks.video) tracks.push(context.tracks.video);

      if (context.client && tracks.length > 0) {
        await context.client.publish(tracks);
        this.setState(streamId, StreamState.LIVE);
      } else {
        throw new Error('No tracks available to publish');
      }
    } catch (error) {
      this.setState(streamId, StreamState.ERROR, error instanceof Error ? error : new Error('Failed to start stream'));
      await this.cleanup(streamId);
      throw error;
    }
  }

  async cleanup(streamId: string): Promise<void> {
    this.setState(streamId, StreamState.CLEANUP);

    try {
      const context = this.getContext(streamId);
      if (!context) return;

      // Clean up tracks first
      await this.cleanupTracks(context.tracks);

      // Clear video container
      if (context.videoContainer) {
        while (context.videoContainer.firstChild) {
          context.videoContainer.firstChild.remove();
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
    }
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
}

export const streamLifecycle = new StreamLifecycleManager(); 