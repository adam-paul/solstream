// src/lib/agoraService.ts

import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from '@/types/agora';
import type { IAgoraService } from './agoraServiceInterface';
import type {
  StreamConfig,
  MediaDevices,
  DeviceConfig,
  ConnectionCallback,
  UserPublishedCallback,
  UserUnpublishedCallback,
  LocalTracks
} from '@/types/agora';

// Only import AgoraRTC on client
let AgoraRTC: any;
if (typeof window !== 'undefined') {
  // Dynamic import to ensure proper loading
  import('agora-rtc-sdk-ng').then(module => {
    AgoraRTC = module.default;
  }).catch(error => {
    console.error('Failed to load AgoraRTC:', error);
  });
}

export class AgoraService implements IAgoraService {
  private client: IAgoraRTCClient | null = null;
  private videoTrack: ICameraVideoTrack | null = null;
  private audioTrack: IMicrophoneAudioTrack | null = null;
  private appId: string;
  
  constructor() {
    this.appId = process.env.NEXT_PUBLIC_AGORA_APP_ID || '';
    if (!this.appId) {
      throw new Error('Agora App ID not configured');
    }
  }

  async initializeClient(config: StreamConfig): Promise<IAgoraRTCClient> {
    if (!AgoraRTC) {
      throw new Error('AgoraRTC not available');
    }

    try {
      // Ensure cleanup of any existing client
      await this.cleanup();

      const client = AgoraRTC.createClient({
        mode: "live",
        codec: "vp8",
        role: config.role
      });

      this.client = client;

      let token = config.token;
      let uid = config.uid;

      if (!token) {
        const response = await fetch(`/api/agora-token?channel=${config.streamId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch token');
        }
        const data = await response.json();
        token = data.token;
        uid = data.uid;
      }

      await client.join(this.appId, config.streamId, token || null, uid);
      return client;
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  async initializeHostTracks(deviceConfig?: DeviceConfig): Promise<LocalTracks> {
    if (!AgoraRTC) {
      throw new Error('AgoraRTC not available');
    }

    try {
      // Check device availability first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideo = devices.some(device => device.kind === 'videoinput');
      const hasAudio = devices.some(device => device.kind === 'audioinput');

      if (!hasVideo || !hasAudio) {
        throw new Error(`Required devices not available: ${!hasVideo ? 'camera' : ''} ${!hasAudio ? 'microphone' : ''}`);
      }

      // Request permissions with more specific constraints
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          deviceId: deviceConfig?.cameraId ? { exact: deviceConfig.cameraId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }, 
        audio: {
          deviceId: deviceConfig?.microphoneId ? { exact: deviceConfig.microphoneId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Release the test stream immediately
      stream.getTracks().forEach(track => track.stop());

      // Create tracks with more detailed error handling
      const [audioTrack, videoTrack] = await Promise.all([
        AgoraRTC.createMicrophoneAudioTrack({
          deviceId: deviceConfig?.microphoneId,
          AEC: true,
          ANS: true,
          AGC: true
        }).catch((error: Error) => {
          console.error('Failed to create audio track:', error);
          throw new Error(`Failed to initialize microphone: ${error.message}`);
        }),
        AgoraRTC.createCameraVideoTrack({
          deviceId: deviceConfig?.cameraId,
          encoderConfig: {
            width: 1280,
            height: 720,
            frameRate: 30,
            bitrateMin: 600,
            bitrateMax: 1500
          }
        }).catch((error: Error) => {
          console.error('Failed to create video track:', error);
          throw new Error(`Failed to initialize camera: ${error.message}`);
        })
      ]);

      this.audioTrack = audioTrack;
      this.videoTrack = videoTrack;

      return { audioTrack, videoTrack };
    } catch (error: unknown) {
      // Ensure cleanup of any partially initialized tracks
      if (this.audioTrack) {
        await this.audioTrack.stop();
        await this.audioTrack.close();
        this.audioTrack = null;
      }
      if (this.videoTrack) {
        await this.videoTrack.stop();
        await this.videoTrack.close();
        this.videoTrack = null;
      }
      
      // Rethrow with more context
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Failed to initialize media devices: ${errorMessage}`);
    }
  }

  async publishTracks(): Promise<void> {
    if (!this.client || !this.audioTrack || !this.videoTrack) {
      throw new Error('Client or tracks not initialized');
    }

    try {
      await this.client.publish([this.audioTrack, this.videoTrack]);
    } catch (error) {
      await this.cleanup();
      throw error;
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
    if (!this.client) return;

    try {
      await this.client.subscribe(user, mediaType);
      
      if (mediaType === 'video') {
        user.videoTrack?.play(container);
      } else if (mediaType === 'audio') {
        user.audioTrack?.play();
      }
    } catch (error) {
      console.error('Subscribe error:', error);
      throw error;
    }
  }

  async getDevices(): Promise<MediaDevices> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    return {
      cameras: devices.filter(device => device.kind === 'videoinput'),
      microphones: devices.filter(device => device.kind === 'audioinput')
    };
  }

  async switchCamera(deviceId: string): Promise<ICameraVideoTrack> {
    if (!AgoraRTC || !this.videoTrack) {
      throw new Error('AgoraRTC or video track not available');
    }

    try {
      const newTrack = await AgoraRTC.createCameraVideoTrack({
        deviceId,
        encoderConfig: {
          width: 1280,
          height: 720,
          frameRate: 30
        }
      });

      if (this.client) {
        await this.client.unpublish(this.videoTrack);
        await this.client.publish(newTrack);
      }

      await this.videoTrack.stop();
      await this.videoTrack.close();
      this.videoTrack = newTrack;
      return newTrack;
    } catch (error) {
      console.error('Failed to switch camera:', error);
      throw error;
    }
  }

  async switchMicrophone(deviceId: string): Promise<IMicrophoneAudioTrack> {
    if (!AgoraRTC || !this.audioTrack) {
      throw new Error('AgoraRTC or audio track not available');
    }

    try {
      const newTrack = await AgoraRTC.createMicrophoneAudioTrack({
        deviceId,
        AEC: true,
        ANS: true,
        AGC: true
      });

      if (this.client) {
        await this.client.unpublish(this.audioTrack);
        await this.client.publish(newTrack);
      }

      await this.audioTrack.stop();
      await this.audioTrack.close();
      this.audioTrack = newTrack;
      return newTrack;
    } catch (error) {
      console.error('Failed to switch microphone:', error);
      throw error;
    }
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

  onConnectionStateChange(callback: ConnectionCallback): void {
    this.client?.on('connection-state-change', callback);
  }

  onUserPublished(callback: UserPublishedCallback): void {
    this.client?.on('user-published', callback);
  }

  onUserUnpublished(callback: UserUnpublishedCallback): void {
    this.client?.on('user-unpublished', callback);
  }

  async cleanup(): Promise<void> {
    console.log('[AgoraService] Starting cleanup...');
    try {
      // Stop and close video track with error handling
      if (this.videoTrack) {
        try {
          this.videoTrack.stop();
          await this.videoTrack.close();
        } catch (error) {
          console.error('[AgoraService] Error cleaning up video track:', error);
        }
        this.videoTrack = null;
      }

      // Stop and close audio track with error handling
      if (this.audioTrack) {
        try {
          this.audioTrack.stop();
          await this.audioTrack.close();
        } catch (error) {
          console.error('[AgoraService] Error cleaning up audio track:', error);
        }
        this.audioTrack = null;
      }

      // Leave and close client with error handling
      if (this.client) {
        try {
          // Remove all event listeners
          this.client.removeAllListeners();
          // Only try to leave if connected
          if (this.client.connectionState === 'CONNECTED') {
            await this.client.leave();
          }
        } catch (error) {
          console.error('[AgoraService] Error cleaning up client:', error);
        }
        this.client = null;
      }
    } catch (error) {
      console.error('[AgoraService] Cleanup error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const agoraService = new AgoraService();
