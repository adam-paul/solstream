// src/types/agora.ts

import type { 
  IAgoraRTCClient, 
  ICameraVideoTrack, 
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
  IRemoteVideoTrack,
  IRemoteAudioTrack
} from 'agora-rtc-sdk-ng';

// Core Agora Types
export type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
  IRemoteVideoTrack,
  IRemoteAudioTrack
};

// Stream Configuration
export interface StreamConfig {
  role: 'host' | 'audience';
  streamId: string;
  token?: string;
  uid?: number;
  container?: HTMLElement;
}

// Device Management
export interface MediaDevices {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
}

export interface DeviceConfig {
  cameraId: string | null;
  microphoneId: string | null;
}

// Track Management
export interface LocalTracks {
  audioTrack: IMicrophoneAudioTrack | null;
  videoTrack: ICameraVideoTrack | null;
}

// Service Interface
export interface IAgoraService {
  // Core initialization and cleanup
  initializeClient(config: StreamConfig): Promise<IAgoraRTCClient>;
  cleanup(): Promise<void>;
  
  // Media track management
  initializeHostTracks(deviceConfig?: DeviceConfig): Promise<LocalTracks>;
  publishTracks(): Promise<void>;
  playVideo(container: HTMLElement): void;
  
  // Device management
  fetchDevices(): Promise<MediaDevices>;
  switchCamera(deviceId: string): Promise<void>;
  switchMicrophone(deviceId: string): Promise<void>;
  
  // Track controls
  toggleVideo(enabled: boolean): Promise<void>;
  toggleAudio(enabled: boolean): Promise<void>;
}

// Window Augmentation
declare global {
  interface Window {
    AgoraRTC?: {
      createClient(config: {
        mode: string;
        codec: string;
        role?: string;
      }): IAgoraRTCClient;
      createMicrophoneAudioTrack(config?: {
        deviceId?: string;
        AEC?: boolean;
        ANS?: boolean;
        AGC?: boolean;
      }): Promise<IMicrophoneAudioTrack>;
      createCameraVideoTrack(config?: {
        deviceId?: string;
        encoderConfig?: {
          width: number | { min: number; ideal: number; max: number };
          height: number | { min: number; ideal: number; max: number };
          frameRate: number;
          bitrateMin?: number;
          bitrateMax?: number;
        };
      }): Promise<ICameraVideoTrack>;
    };
  }
}
