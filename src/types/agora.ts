// src/types/agora.ts

import type { 
  IAgoraRTCClient, 
  ICameraVideoTrack, 
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser
} from 'agora-rtc-sdk-ng';

// Core Agora Types
export type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser
};

// Stream Configuration
export interface StreamConfig {
  role: 'host' | 'audience';
  streamId: string;
  token?: string;
  uid?: number;
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
          width: number;
          height: number;
          frameRate: number;
          bitrateMin?: number;
          bitrateMax?: number;
        };
      }): Promise<ICameraVideoTrack>;
    };
  }
}