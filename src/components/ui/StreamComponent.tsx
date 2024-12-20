'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Mic, Video, VideoOff, MicOff, Settings } from 'lucide-react';
import { agoraService } from '@/lib/agoraService';
import { useStreamStore } from '@/lib/StreamStore';
import { DEFAULT_PREVIEW_CONFIG } from '@/config/preview';

interface StreamComponentProps {
  streamId: string;
}

interface StreamControls {
  videoEnabled: boolean;
  audioEnabled: boolean;
  selectedCamera: string;
  selectedMicrophone: string;
}

const StreamComponent: React.FC<StreamComponentProps> = ({ streamId }) => {
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const previewIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const mountedRef = useRef(true);
  
  // State
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [controls, setControls] = useState<StreamControls>({
    videoEnabled: true,
    audioEnabled: true,
    selectedCamera: '',
    selectedMicrophone: ''
  });
  const [devices, setDevices] = useState<{
    cameras: MediaDeviceInfo[];
    microphones: MediaDeviceInfo[];
  }>({ cameras: [], microphones: [] });
  const [showSettings, setShowSettings] = useState(false);

  const { getStream, endStream, updatePreview } = useStreamStore();
  const stream = getStream(streamId);

  // Error handling
  const handleMediaError = useCallback((operation: string, err: unknown) => {
    const message = err instanceof Error ? err.message : 'Media operation failed';
    setError(`${operation}: ${message}`);
    setTimeout(() => setError(null), 5000);
  }, []);

  // Preview capture
  const capturePreview = useCallback(() => {
    if (!videoRef.current || !mountedRef.current || !isLive) return;

    const video = videoRef.current.querySelector('video');
    if (!video || video.readyState < 2) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleFactor = 0.5;
    canvas.width = video.videoWidth * scaleFactor;
    canvas.height = video.videoHeight * scaleFactor;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const previewUrl = canvas.toDataURL('image/jpeg', DEFAULT_PREVIEW_CONFIG.compressionQuality);
    if (previewUrl.length <= 200000) {
      updatePreview(streamId, previewUrl);
    }

    canvas.remove();
  }, [streamId, updatePreview, isLive]);

  // Media control handlers
  const toggleVideo = useCallback(async () => {
    try {
      await agoraService.toggleVideo(!controls.videoEnabled);
      setControls(prev => ({ ...prev, videoEnabled: !prev.videoEnabled }));
    } catch (err) {
      handleMediaError('Failed to toggle video', err);
    }
  }, [controls.videoEnabled, handleMediaError]);

  const toggleAudio = useCallback(async () => {
    try {
      await agoraService.toggleAudio(!controls.audioEnabled);
      setControls(prev => ({ ...prev, audioEnabled: !prev.audioEnabled }));
    } catch (err) {
      handleMediaError('Failed to toggle audio', err);
    }
  }, [controls.audioEnabled, handleMediaError]);

  const handleDeviceChange = useCallback(async (type: 'camera' | 'microphone', deviceId: string) => {
    try {
      if (type === 'camera') {
        await agoraService.switchCamera(deviceId);
        setControls(prev => ({ ...prev, selectedCamera: deviceId }));
      } else {
        await agoraService.switchMicrophone(deviceId);
        setControls(prev => ({ ...prev, selectedMicrophone: deviceId }));
      }
    } catch (err) {
      handleMediaError(`Failed to switch ${type}`, err);
    }
  }, [handleMediaError]);

  // Initialize stream
  const startLiveStream = useCallback(async () => {
    if (!videoRef.current || !stream) return;
  
    try {
      await agoraService.initializeClient({
        role: 'host',
        streamId
      });
    
      const { audioTrack, videoTrack } = await agoraService.initializeHostTracks({
        cameraId: controls.selectedCamera || null,
        microphoneId: controls.selectedMicrophone || null
      });
    
      if (!audioTrack && !videoTrack) {
        throw new Error('Failed to initialize media tracks');
      }
  
      if (videoTrack) {
        agoraService.playVideo(videoRef.current);
      }
  
      await agoraService.publishTracks();
      setIsLive(true);
  
      // Set up preview capture
      setTimeout(capturePreview, DEFAULT_PREVIEW_CONFIG.initialDelay);
      previewIntervalRef.current = setInterval(
        capturePreview,
        DEFAULT_PREVIEW_CONFIG.updateInterval
      );
    } catch (err) {
      handleMediaError('Failed to start stream', err);
      await agoraService.cleanup();
    }
  }, [stream, streamId, capturePreview, controls.selectedCamera, controls.selectedMicrophone, handleMediaError]);

  // Handle stream end
  const handleEndStream = useCallback(async () => {
    if (previewIntervalRef.current) {
      clearInterval(previewIntervalRef.current);
    }
    await agoraService.cleanup();
    endStream(streamId);
    window.location.href = '/';
  }, [streamId, endStream]);

  // Initialize devices
  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      try {
        const availableDevices = await agoraService.getDevices();
        if (!mountedRef.current) return;
        
        setDevices(availableDevices);
        setControls(prev => ({
          ...prev,
          selectedCamera: availableDevices.cameras[0]?.deviceId || '',
          selectedMicrophone: availableDevices.microphones[0]?.deviceId || ''
        }));
      } catch (err) {
        if (mountedRef.current) {
          handleMediaError('Failed to initialize devices', err);
        }
      }
    };

    initialize();

    return () => {
      mountedRef.current = false;
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
      agoraService.cleanup().catch(console.error);
    };
  }, [handleMediaError]);

  // Device change listener
  useEffect(() => {
    const handleDevicesChanged = () => {
      agoraService.getDevices()
        .then(newDevices => {
          if (mountedRef.current) {
            setDevices(newDevices);
          }
        })
        .catch(err => handleMediaError('Failed to update devices', err));
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDevicesChanged);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDevicesChanged);
    };
  }, [handleMediaError]);

  if (!stream) return null;

  return (
    <div className="w-full bg-gray-800 rounded-lg p-4 mb-8">
      {/* Stream Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-yellow-400">
            {isLive ? 'Live: ' : 'Preview: '}{stream.title}
          </h2>
          {stream.ticker && <p className="text-gray-400">${stream.ticker}</p>}
        </div>
        
        <div className="flex gap-2">
          {!isLive && (
            <button
              onClick={startLiveStream}
              disabled={!!error}
              className={`px-4 py-2 rounded-lg ${
                error
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              Go Live
            </button>
          )}
          <button 
            onClick={handleEndStream}
            className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg"
          >
            End Stream
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="text-red-500 p-4 bg-gray-900 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Video Preview */}
      <div className="relative">
        <div 
          ref={videoRef}
          className="w-full aspect-video bg-gray-900 rounded-lg"
        />

        {/* Stream Controls */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-4">
          <button
            onClick={toggleVideo}
            className={`p-2 rounded-full ${
              controls.videoEnabled ? 'bg-blue-500' : 'bg-red-500'
            }`}
          >
            {controls.videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          <button
            onClick={toggleAudio}
            className={`p-2 rounded-full ${
              controls.audioEnabled ? 'bg-blue-500' : 'bg-red-500'
            }`}
          >
            {controls.audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          <button
            onClick={() => setShowSettings(prev => !prev)}
            className="p-2 rounded-full bg-gray-700 hover:bg-gray-600"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mt-4 p-4 bg-gray-900 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Stream Settings</h3>

          <div className="space-y-4">
            {/* Camera Selection */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Camera</label>
              <select
                value={controls.selectedCamera}
                onChange={(e) => handleDeviceChange('camera', e.target.value)}
                className="w-full bg-gray-800 rounded p-2"
              >
                {devices.cameras.map(camera => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label || `Camera ${camera.deviceId}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Microphone Selection */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Microphone</label>
              <select
                value={controls.selectedMicrophone}
                onChange={(e) => handleDeviceChange('microphone', e.target.value)}
                className="w-full bg-gray-800 rounded p-2"
              >
                {devices.microphones.map(mic => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `Microphone ${mic.deviceId}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Viewer Count */}
      {isLive && stream.viewers > 0 && (
        <div className="mt-4 text-sm text-gray-400">
          {stream.viewers} viewer{stream.viewers !== 1 ? 's' : ''} watching
        </div>
      )}

      {/* Stream Description */}
      {stream.description && (
        <p className="mt-4 text-gray-300">{stream.description}</p>
      )}
    </div>
  );
};

export default StreamComponent;
