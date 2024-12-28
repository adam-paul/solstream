// src/lib/agoraService.ts

import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import AgoraRTC from 'agora-rtc-sdk-ng';

export class AgoraService {
  private client: IAgoraRTCClient | null = null;
  private tracks: {
    audio: IMicrophoneAudioTrack | null;
    video: ICameraVideoTrack | null;
  } = {
    audio: null,
    video: null
  };

  constructor(private readonly appId: string = process.env.NEXT_PUBLIC_AGORA_APP_ID || '') {
    if (!this.appId) throw new Error('Agora App ID not configured');
  }

  async setupStream(config: {
    streamId: string;
    role: 'host' | 'audience';
    container?: HTMLElement;
  }) {
    try {
      // Clean up existing client/tracks
      await this.cleanup();

      // Initialize client
      this.client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      await this.client.setClientRole(config.role);

      // Get token
      const { token, uid } = await this.fetchToken(config.streamId, config.role === 'host');

      // Join channel
      await this.client.join(this.appId, config.streamId, token, uid);

      // Set up tracks for host
      if (config.role === 'host') {
        await this.initHostTracks();
        const tracksToPublish = Object.values(this.tracks).filter((track): track is ICameraVideoTrack | IMicrophoneAudioTrack => track !== null);
      if (tracksToPublish.length > 0) {
        await this.client.publish(tracksToPublish);
      }
      }

      // Set up viewer container and handlers
      if (config.role === 'audience' && config.container) {
        this.setupViewerHandlers(config.container);
      }

      return this.client;
    } catch (error) {
      console.error('Stream setup failed:', error);
      await this.cleanup();
      throw error;
    }
  }

  private async initHostTracks() {
    try {
      // Create tracks with optimal settings
      const [audio, video] = await Promise.all([
        AgoraRTC.createMicrophoneAudioTrack({
          AEC: true,
          ANS: true,
          AGC: true
        }),
        AgoraRTC.createCameraVideoTrack({
          encoderConfig: {
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 },
            frameRate: 30
          }
        })
      ]);

      this.tracks = { audio, video };
      
      // Play video in container if provided
      if (this.tracks.video) {
        this.tracks.video.play(document.createElement('div'));
      }
    } catch (error) {
      console.error('Failed to initialize host tracks:', error);
      throw error;
    }
  }

  private setupViewerHandlers(container: HTMLElement) {
    if (!this.client) return;

    this.client.on('user-published', async (user, mediaType) => {
      try {
        await this.client?.subscribe(user, mediaType);

        if (mediaType === 'video' && user.videoTrack) {
          user.videoTrack.play(container);
        }
        if (mediaType === 'audio' && user.audioTrack) {
          user.audioTrack.play();
        }
      } catch (error) {
        console.error('Failed to handle published media:', error);
      }
    });
  }

  private async fetchToken(channel: string, isHost: boolean): Promise<{ token: string; uid: number }> {
    const response = await fetch(`/api/agora-token?channel=${channel}&isHost=${isHost}`);
    if (!response.ok) throw new Error('Failed to fetch token');
    return response.json();
  }

  async cleanup(): Promise<void> {
    // Stop and close tracks
    for (const track of Object.values(this.tracks)) {
      if (track) {
        track.stop();
        await track.close();
      }
    }
    this.tracks = { audio: null, video: null };

    // Leave and clean up client
    if (this.client?.connectionState === 'CONNECTED') {
      this.client.removeAllListeners();
      await this.client.leave();
    }
    this.client = null;
  }

  // Simple media controls
  async toggleAudio(enabled: boolean) {
    if (this.tracks.audio) {
      await this.tracks.audio.setEnabled(enabled);
    }
  }

  async toggleVideo(enabled: boolean) {
    if (this.tracks.video) {
      await this.tracks.video.setEnabled(enabled);
    }
  }
}

export const agoraService = new AgoraService();
