import type { 
  IAgoraRTCClient, 
  ICameraVideoTrack, 
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser
} from 'agora-rtc-sdk-ng';

export interface IAgoraRTC {
  createClient(config: {
    mode: string;
    codec: string;
    role?: string;
  }): IAgoraRTCClient;
  createMicrophoneAudioTrack(): Promise<IMicrophoneAudioTrack>;
  createCameraVideoTrack(): Promise<ICameraVideoTrack>;
}

declare global {
  interface Window {
    AgoraRTC?: IAgoraRTC;
  }
}

export type RemoteUser = IAgoraRTCRemoteUser;
