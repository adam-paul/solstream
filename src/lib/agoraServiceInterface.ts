// src/lib/agoraServiceInterface.ts
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  StreamConfig,
  MediaDevices,
  DeviceConfig,
  LocalTracks
} from '@/types/agora';

export interface IAgoraService {
  // Core initialization and cleanup
  initializeClient(config: StreamConfig): Promise<IAgoraRTCClient>;
  cleanup(): Promise<void>;
  
  // Media track management
  initializeHostTracks(deviceConfig?: DeviceConfig): Promise<LocalTracks>;
  publishTracks(): Promise<void>;
  playVideo(container: HTMLElement): void;
  
  // Remote user handling
  handleUserPublished(
    container: HTMLElement,
    user: IAgoraRTCRemoteUser, 
    mediaType: 'audio' | 'video'
  ): Promise<void>;
  
  // Device management
  getDevices(): Promise<MediaDevices>;
  switchCamera(deviceId: string): Promise<void>;
  switchMicrophone(deviceId: string): Promise<void>;
  
  // Track controls
  toggleVideo(enabled: boolean): Promise<void>;
  toggleAudio(enabled: boolean): Promise<void>;
}
