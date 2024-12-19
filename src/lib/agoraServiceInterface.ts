// src/lib/agoraServiceInterface.ts
import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
  StreamConfig,
  MediaDevices,
  DeviceConfig,
  ConnectionCallback,
  UserPublishedCallback,
  UserUnpublishedCallback,
  LocalTracks
} from '@/types/agora';

export interface IAgoraService {
  // Client Management
  initializeClient(config: StreamConfig): Promise<IAgoraRTCClient>;
  cleanup(): Promise<void>;
  
  // Track Management
  initializeHostTracks(deviceConfig?: DeviceConfig): Promise<LocalTracks>;
  publishTracks(): Promise<void>;
  playVideo(container: HTMLElement): void;
  
  // Remote User Handling
  handleUserPublished(
    container: HTMLElement,
    user: IAgoraRTCRemoteUser, 
    mediaType: 'audio' | 'video'
  ): Promise<void>;
  
  // Device Management
  getDevices(): Promise<MediaDevices>;
  switchCamera(deviceId: string): Promise<ICameraVideoTrack>;
  switchMicrophone(deviceId: string): Promise<IMicrophoneAudioTrack>;
  
  // Track Controls
  toggleVideo(enabled: boolean): Promise<void>;
  toggleAudio(enabled: boolean): Promise<void>;
  
  // Event Listeners
  onConnectionStateChange(callback: ConnectionCallback): void;
  onUserPublished(callback: UserPublishedCallback): void;
  onUserUnpublished(callback: UserUnpublishedCallback): void;
}
