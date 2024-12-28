// src/lib/agoraService.ts

import type { 
  IAgoraRTCClient, 
  StreamConfig, 
  MediaDevices, 
  DeviceConfig, 
  LocalTracks,
  IAgoraService
} from '@/types/agora';
import AgoraRTC from 'agora-rtc-sdk-ng';

export class AgoraService implements IAgoraService {
  private client: IAgoraRTCClient | null = null;
  private localTracks: LocalTracks = {
    audioTrack: null,
    videoTrack: null
  };
  private videoContainer: HTMLElement | null = null;
  private readonly appId: string;
  
  constructor() {
    this.appId = process.env.NEXT_PUBLIC_AGORA_APP_ID || '';
    if (!this.appId) {
      throw new Error('Agora App ID not configured');
    }
  }

  async initializeClient(config: StreamConfig & { container?: HTMLElement }): Promise<IAgoraRTCClient> {
    await this.cleanup();

    console.log('Initializing Agora client:', { 
      role: config.role,
      streamId: config.streamId,
      hasToken: !!config.token
    });

    this.client = AgoraRTC.createClient({
      mode: "live",
      codec: "vp8"
    });

    // Store container reference for audience role
    if (config.role === 'audience' && config.container) {
      this.videoContainer = config.container;
    }

    await this.client.setClientRole(config.role === 'host' ? 'host' : 'audience');

    const tokenData = config.token ? 
      { token: config.token, uid: config.uid } : 
      await this.fetchToken(config.streamId, config.role === 'host');
    
    console.log('Joining with token:', {
      appId: this.appId.slice(0,5) + '...',
      hasToken: !!tokenData.token,
      role: config.role,
      tokenPrefix: tokenData.token.substring(0, 32),
      uid: tokenData.uid,
      connectionState: this.client?.connectionState,
      timestamp: Date.now()
    });

    await this.client.join(
      this.appId,
      config.streamId,
      tokenData.token,
      tokenData.uid
    );

    // Add event listeners for audience role
    if (config.role === 'audience' && this.videoContainer) {
      this.client.on('user-published', async (user, mediaType) => {
        console.log('User published event:', {
          userId: user.uid,
          mediaType,
          hasAudioTrack: !!user.audioTrack,
          hasVideoTrack: !!user.videoTrack,
          clientState: this.client?.connectionState
        });
    
        try {
          if (!this.client) {
            throw new Error('Client not initialized');
          }
    
          await this.client.subscribe(user, mediaType);
          
          console.log('Post-subscribe state:', {
            mediaType,
            hasTrack: mediaType === 'video' ? !!user.videoTrack : !!user.audioTrack
          });
    
          if (mediaType === 'video' && user.videoTrack && this.videoContainer) {
            user.videoTrack.play(this.videoContainer);
            console.log('Video track played');
          } else if (mediaType === 'audio' && user.audioTrack) {
            user.audioTrack.play();
            console.log('Audio track played');
          }
        } catch (error) {
          console.error('Failed to handle published media:', error);
          throw error;
        }
      });
    }
    
    return this.client;
  }

  private async fetchToken(channel: string, isHost: boolean = false): Promise<{token: string, uid: number}> {
    console.log('Fetching token:', { channel, isHost });
    const response = await fetch(`/api/agora-token?channel=${channel}&isHost=${isHost}`);
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Token fetch failed:', error);
      throw new Error('Failed to fetch token');
    }
    
    const data = await response.json();
    console.log('Token response:', { 
      hasToken: !!data.token,
      uid: data.uid,
      appId: data.appId?.slice(0,5) + '...',
      channel: data.channelName,
      role: data.role,
      expires: new Date(data.expires * 1000).toISOString()
    });
    
    return {
      token: data.token,
      uid: data.uid
    };
  }

  async initializeHostTracks(deviceConfig?: DeviceConfig): Promise<LocalTracks> {
    try {
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        microphoneId: deviceConfig?.microphoneId || undefined,
        AEC: true,
        ANS: true,
        AGC: true
      });

      const videoTrack = await AgoraRTC.createCameraVideoTrack({
        cameraId: deviceConfig?.cameraId || undefined,
        encoderConfig: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          frameRate: 30,
          bitrateMin: 600,
          bitrateMax: 1500
        }
      });

      await audioTrack.setEnabled(true);
      await videoTrack.setEnabled(true);

      this.localTracks = { audioTrack, videoTrack };
      return this.localTracks;
    } catch (error) {
      console.error('Failed to initialize tracks:', error);
      throw new Error('Failed to initialize media tracks');
    }
  }

  async publishTracks(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
    
    const tracks = Object.values(this.localTracks).filter(track => track !== null);
    if (tracks.length === 0) {
      throw new Error('No tracks available to publish');
    }

    await this.client.publish(tracks);
    console.log('Published tracks:', {
      audioTrack: !!this.localTracks.audioTrack,
      videoTrack: !!this.localTracks.videoTrack,
      clientState: this.client.connectionState,
    });
  }

  playVideo(container: HTMLElement): void {
    this.videoContainer = container;
    
    if (this.localTracks.videoTrack) {
      this.localTracks.videoTrack.play(container);
    }
  }

  async getDevices(): Promise<MediaDevices> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    return {
      cameras: devices.filter(device => device.kind === 'videoinput'),
      microphones: devices.filter(device => device.kind === 'audioinput')
    };
  }

  async switchCamera(deviceId: string): Promise<void> {
    if (!this.localTracks.videoTrack) {
      throw new Error('Video track not initialized');
    }

    const newTrack = await AgoraRTC.createCameraVideoTrack({
      cameraId: deviceId,
      encoderConfig: {
        width: 1280,
        height: 720,
        frameRate: 30
      }
    });

    if (this.client) {
      await this.client.unpublish(this.localTracks.videoTrack);
    }
    
    this.localTracks.videoTrack.stop();
    await this.localTracks.videoTrack.close();
    
    this.localTracks.videoTrack = newTrack;
    await newTrack.setEnabled(true);
    
    if (this.client) {
      await this.client.publish(newTrack);
    }

    if (this.videoContainer) {
      this.playVideo(this.videoContainer);
    }
  }

  async switchMicrophone(deviceId: string): Promise<void> {
    if (!this.localTracks.audioTrack) {
      throw new Error('Audio track not initialized');
    }

    const newTrack = await AgoraRTC.createMicrophoneAudioTrack({
      microphoneId: deviceId,
      AEC: true,
      ANS: true,
      AGC: true
    });

    if (this.client) {
      await this.client.unpublish(this.localTracks.audioTrack);
    }
    
    this.localTracks.audioTrack.stop();
    await this.localTracks.audioTrack.close();
    
    this.localTracks.audioTrack = newTrack;
    await newTrack.setEnabled(true);
    
    if (this.client) {
      await this.client.publish(newTrack);
    }
  }

  async toggleVideo(enabled: boolean): Promise<void> {
    if (this.localTracks.videoTrack) {
      await this.localTracks.videoTrack.setEnabled(enabled);
    }
  }

  async toggleAudio(enabled: boolean): Promise<void> {
    if (this.localTracks.audioTrack) {
      await this.localTracks.audioTrack.setEnabled(enabled);
    }
  }

  async cleanup(): Promise<void> {
    try {
      // Clean DOM first to prevent memory leaks
      if (this.videoContainer) {
        while (this.videoContainer.firstChild) {
          this.videoContainer.removeChild(this.videoContainer.firstChild);
        }
        this.videoContainer = null;
      }

      // Cleanup tracks in parallel for faster execution
      const trackCleanup = Object.values(this.localTracks)
        .filter(track => track !== null)
        .map(async track => {
          track?.stop();
          await track?.close();
        });
      
      await Promise.all(trackCleanup);
      this.localTracks = { audioTrack: null, videoTrack: null };

      // Cleanup client last
      if (this.client?.connectionState === 'CONNECTED' || 
          this.client?.connectionState === 'CONNECTING') {
        this.client.removeAllListeners();
        await this.client.leave();
      }
      this.client = null;
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Reset state even if cleanup fails
      this.localTracks = { audioTrack: null, videoTrack: null };
      this.client = null;
      this.videoContainer = null;
    }
  }
}

export const agoraService = new AgoraService();
