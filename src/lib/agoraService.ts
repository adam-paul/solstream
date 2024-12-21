// src/lib/agoraService.ts

import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from '@/types/agora';
import type { IAgoraService } from './agoraServiceInterface';
import type { StreamConfig, MediaDevices, DeviceConfig, LocalTracks } from '@/types/agora';
import AgoraRTC from 'agora-rtc-sdk-ng';

export class AgoraService implements IAgoraService {
  private client: IAgoraRTCClient | null = null;
  private videoTrack: ICameraVideoTrack | null = null;
  private audioTrack: IMicrophoneAudioTrack | null = null;
  private readonly appId: string;
  
  constructor() {
    this.appId = process.env.NEXT_PUBLIC_AGORA_APP_ID || '';
    if (!this.appId) {
      throw new Error('Agora App ID not configured');
    }
  }

  async initializeClient(config: StreamConfig): Promise<IAgoraRTCClient> {
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
      tokenData.uid // Always use the UID that was generated with the token
    );
    
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
    if (!this.client) throw new Error('Client not initialized');

    const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
      microphoneId: deviceConfig?.microphoneId || undefined,
      AEC: true,
      ANS: true,
      AGC: true
    }).catch(() => null);

    const videoTrack = await AgoraRTC.createCameraVideoTrack({
      cameraId: deviceConfig?.cameraId || undefined,
      encoderConfig: {
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        frameRate: 30,
        bitrateMin: 600,
        bitrateMax: 1500
      }
    }).catch(() => null);

    this.audioTrack = audioTrack;
    this.videoTrack = videoTrack;

    return { audioTrack, videoTrack };
  }

  async publishTracks(): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    const tracks = [];
    if (this.audioTrack) tracks.push(this.audioTrack);
    if (this.videoTrack) tracks.push(this.videoTrack);

    if (tracks.length > 0) {
      await this.client.publish(tracks);
    }
  }

  playVideo(container: HTMLElement): void {
    if (this.videoTrack) {
      this.videoTrack.play(container);
    }
  }

  async handleUserPublished(
    container: HTMLElement,
    user: IAgoraRTCRemoteUser, 
    mediaType: 'audio' | 'video'
  ): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    await this.client.subscribe(user, mediaType);
    
    if (mediaType === 'video' && user.videoTrack) {
      user.videoTrack.play(container);
    } else if (mediaType === 'audio' && user.audioTrack) {
      user.audioTrack.play();
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
    if (!this.client || !this.videoTrack) {
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

    await this.client.unpublish(this.videoTrack);
    await this.client.publish(newTrack);

    this.videoTrack.stop();
    await this.videoTrack.close();
    this.videoTrack = newTrack;
  }

  async switchMicrophone(deviceId: string): Promise<void> {
    if (!this.client || !this.audioTrack) {
      throw new Error('Audio track not initialized');
    }

    const newTrack = await AgoraRTC.createMicrophoneAudioTrack({
      microphoneId: deviceId,
      AEC: true,
      ANS: true,
      AGC: true
    });

    await this.client.unpublish(this.audioTrack);
    await this.client.publish(newTrack);

    this.audioTrack.stop();
    await this.audioTrack.close();
    this.audioTrack = newTrack;
  }

  async toggleVideo(enabled: boolean): Promise<void> {
    if (this.videoTrack) {
      await this.videoTrack.setEnabled(enabled);
    }
  }

  async toggleAudio(enabled: boolean): Promise<void> {
    if (this.audioTrack) {
      await this.audioTrack.setEnabled(enabled);
    }
  }

  async cleanup(): Promise<void> {
    if (this.videoTrack) {
      this.videoTrack.stop();
      await this.videoTrack.close();
      this.videoTrack = null;
    }

    if (this.audioTrack) {
      this.audioTrack.stop();
      await this.audioTrack.close();
      this.audioTrack = null;
    }

    if (this.client) {
      this.client.removeAllListeners();
      if (this.client.connectionState === 'CONNECTED') {
        await this.client.leave();
      }
      this.client = null;
    }
  }
}

export const agoraService = new AgoraService();
