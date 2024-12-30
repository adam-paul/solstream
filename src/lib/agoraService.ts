import AgoraRTC, { 
  IAgoraRTCClient, 
  ICameraVideoTrack, 
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser
} from 'agora-rtc-sdk-ng';

import { MediaDevices } from '@/types/agora';

export class AgoraService {
  private client: IAgoraRTCClient | undefined;
  private videoTrack: ICameraVideoTrack | undefined;
  private audioTrack: IMicrophoneAudioTrack | undefined;
  private readonly appId: string;

  constructor() {
    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!appId) throw new Error('Agora App ID not configured');
    this.appId = appId;
  }

  async startBroadcast(streamId: string, container: HTMLElement) {
    try {
      // Initialize client
      this.client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      await this.client.setClientRole("host");

      // Get token
      const response = await fetch(`/api/agora-token?channel=${streamId}&isHost=true`);
      const { token, uid } = await response.json();

      // Join channel
      await this.client.join(this.appId, streamId, token, uid);

      // Create tracks
      this.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      this.videoTrack = await AgoraRTC.createCameraVideoTrack();

      // Play video in container
      if (this.videoTrack) {
        this.videoTrack.play(container);
      }

      // Publish tracks
      if (this.audioTrack && this.videoTrack) {
        await this.client.publish([this.audioTrack, this.videoTrack]);
      }
    } catch (error) {
      console.error('Failed to start broadcast:', error);
      await this.stopBroadcast();
      throw error;
    }
  }

  async startViewing(streamId: string, container: HTMLElement) {
    try {
      // Initialize client
      this.client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      await this.client.setClientRole("audience");

      // Get token
      const response = await fetch(`/api/agora-token?channel=${streamId}&isHost=false`);
      const { token, uid } = await response.json();

      // Join channel
      await this.client.join(this.appId, streamId, token, uid);

      // Handle remote streams
      this.client.on("user-published", async (user: IAgoraRTCRemoteUser, mediaType: 'video' | 'audio') => {
        if (!this.client) return;
        
        await this.client.subscribe(user, mediaType);
        
        if (mediaType === "video" && user.videoTrack) {
          user.videoTrack.play(container);
        }
        if (mediaType === "audio" && user.audioTrack) {
          user.audioTrack.play();
        }
      });
    } catch (error) {
      console.error('Failed to start viewing:', error);
      await this.stopBroadcast();
      throw error;
    }
  }

  async stopBroadcast() {
    try {
      if (this.audioTrack) {
        await this.audioTrack.close();
        this.audioTrack = undefined;
      }
      if (this.videoTrack) {
        await this.videoTrack.close();
        this.videoTrack = undefined;
      }
      if (this.client?.connectionState === 'CONNECTED') {
        await this.client.leave();
        this.client = undefined;
      }
    } catch (error) {
      console.error('Error stopping broadcast:', error);
    }
  }

  async fetchDevices(): Promise<MediaDevices> {
    try {
      const devices = await AgoraRTC.getDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      const microphones = devices.filter(device => device.kind === 'audioinput');
      
      return {
        cameras,
        microphones
      };
    } catch (error) {
      console.error('Failed to get devices:', error);
      throw error;
    }
  }

  async setVideoDevice(deviceId: string) {
    if (this.videoTrack) {
      await this.videoTrack.setDevice(deviceId);
    }
  }

  async setAudioDevice(deviceId: string) {
    if (this.audioTrack) {
      await this.audioTrack.setDevice(deviceId);
    }
  }

  async toggleAudio() {
    if (this.audioTrack) {
      await this.audioTrack.setEnabled(!this.audioTrack.enabled);
      return !this.audioTrack.enabled;
    }
  }

  async toggleVideo() {
    if (this.videoTrack) {
      await this.videoTrack.setEnabled(!this.videoTrack.enabled);
      return !this.videoTrack.enabled;
    }
  }
}

export const agoraService = new AgoraService();
