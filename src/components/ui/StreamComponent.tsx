'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Mic, Video, VideoOff, MicOff, Settings } from 'lucide-react';
import { agoraService } from '@/lib/agoraService';
import { useInitializedStreamStore } from '@/lib/StreamStore';
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

const INITIALIZATION_TIMEOUT = 15000; // 15 seconds

const StreamComponent: React.FC<StreamComponentProps> = ({
  streamId
}) => {
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const initTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const previewIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  // State
  const [error, setError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [devices, setDevices] = useState<{
    cameras: MediaDeviceInfo[];
    microphones: MediaDeviceInfo[];
  }>({
    cameras: [],
    microphones: []
  });
  const [controls, setControls] = useState<StreamControls>({
    videoEnabled: true,
    audioEnabled: true,
    selectedCamera: '',
    selectedMicrophone: ''
  });

  // Get store methods
  const {
    getStream,
    endStream,
    updatePreview
  } = useInitializedStreamStore();
  
  const stream = getStream(streamId);

  // Error handling
  const handleError = useCallback((error: unknown) => {
    const message = error instanceof Error 
      ? error.message 
      : 'An unexpected error occurred';
    
    setError(message);
    setIsInitializing(false);
    
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
    }
  }, []);

  // Preview capture functionality
  const capturePreview = useCallback(async () => {
    if (!videoRef.current || !isLive) return;

    try {
      const video = videoRef.current.querySelector('video');
      if (!video) return;

      const canvas = document.createElement('canvas');
      const scaleFactor = 0.25;
      canvas.width = video.videoWidth * scaleFactor;
      canvas.height = video.videoHeight * scaleFactor;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const previewUrl = canvas.toDataURL('image/jpeg', 0.1);

      if (previewUrl.length <= 100000) {
        updatePreview(streamId, previewUrl);
      }

      canvas.remove();
    } catch (error) {
      console.error('Preview capture error:', error);
    }
  }, [streamId, isLive, updatePreview]);

  const startPreviewCaptures = useCallback(() => {
    // Initial capture
    setTimeout(capturePreview, DEFAULT_PREVIEW_CONFIG.initialDelay);

    // Regular captures
    previewIntervalRef.current = setInterval(
      capturePreview,
      DEFAULT_PREVIEW_CONFIG.updateInterval
    );
  }, [capturePreview]);

  // Initialize stream
  const initializeStream = useCallback(async () => {
    try {
      setIsInitializing(true);
      setError('');

      // Set initialization timeout
      initTimeoutRef.current = setTimeout(() => {
        setError('Stream initialization timed out');
        setIsInitializing(false);
      }, INITIALIZATION_TIMEOUT);

      // Request permissions first, before anything else
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        // Immediately stop the test stream
        stream.getTracks().forEach(track => track.stop());
      } catch (permissionError) {
        console.error('Permission error:', permissionError);
        throw new Error('Please allow camera and microphone access to stream');
      }

      // Only get devices after permissions are granted
      const availableDevices = await agoraService.getDevices();
      setDevices(availableDevices);

      // Set initial device selections if not already set
      setControls(prev => ({
        ...prev,
        selectedCamera: prev.selectedCamera || availableDevices.cameras[0]?.deviceId || '',
        selectedMicrophone: prev.selectedMicrophone || availableDevices.microphones[0]?.deviceId || ''
      }));

      // Initialize Agora client
      await agoraService.initializeClient({
        role: 'host',
        streamId
      });

      // Initialize tracks
      await agoraService.initializeHostTracks({
        cameraId: controls.selectedCamera,
        microphoneId: controls.selectedMicrophone
      });

      // Play video preview
      if (videoRef.current) {
        agoraService.playVideo(videoRef.current);
      }

      // Clear timeout and update state
      clearTimeout(initTimeoutRef.current);
      setIsInitializing(false);

      // Start preview captures
      startPreviewCaptures();
    } catch (error) {
      console.error('Stream initialization error:', error);
      handleError(error);
    }
  }, [streamId, controls.selectedCamera, controls.selectedMicrophone, handleError, startPreviewCaptures]);

  // Handle stream start
  const startLiveStream = useCallback(async () => {
    try {
      await agoraService.publishTracks();
      setIsLive(true);
    } catch (error) {
      console.error('Failed to start live stream:', error);
      handleError(error);
    }
  }, [handleError]);

  // Handle stream end
  const handleEndStream = useCallback(async () => {
    try {
      await agoraService.cleanup();
      endStream(streamId);
      // Force a full page refresh and redirect to home
      window.location.href = '/';
    } catch (error) {
      console.error('Error ending stream:', error);
      handleError(error);
    }
  }, [streamId, endStream, handleError]);

  // Device control handlers
  const toggleVideo = useCallback(async () => {
    try {
      await agoraService.toggleVideo(!controls.videoEnabled);
      setControls(prev => ({ ...prev, videoEnabled: !prev.videoEnabled }));
    } catch (error) {
      console.error('Error toggling video:', error);
    }
  }, [controls.videoEnabled]);

  const toggleAudio = useCallback(async () => {
    try {
      await agoraService.toggleAudio(!controls.audioEnabled);
      setControls(prev => ({ ...prev, audioEnabled: !prev.audioEnabled }));
    } catch (error) {
      console.error('Error toggling audio:', error);
    }
  }, [controls.audioEnabled]);

  const handleDeviceChange = useCallback(async (type: 'camera' | 'microphone', deviceId: string) => {
    try {
      if (type === 'camera') {
        await agoraService.switchCamera(deviceId);
        setControls(prev => ({ ...prev, selectedCamera: deviceId }));
      } else {
        await agoraService.switchMicrophone(deviceId);
        setControls(prev => ({ ...prev, selectedMicrophone: deviceId }));
      }
    } catch (error) {
      console.error('Error changing device:', error);
      handleError(error);
    }
  }, [handleError]);

  // Effect for initialization
  useEffect(() => {
    let mounted = true;

    if (!stream) return;

    const initialize = async () => {
      try {
        await initializeStream();
      } catch (error) {
        if (mounted) {
          handleError(error);
        }
      }
    };

    initialize();

    // Cleanup
    return () => {
      mounted = false;
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
      agoraService.cleanup().catch(console.error);
    };
  }, [stream, initializeStream, handleError]);

  // Device change listener
  useEffect(() => {
    const handleDevicesChanged = () => {
      agoraService.getDevices()
        .then(setDevices)
        .catch(error => console.error('Error updating devices:', error));
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDevicesChanged);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDevicesChanged);
    };
  }, []);

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
          {isLive && (
            <button 
              onClick={handleEndStream}
              className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg"
            >
              End Stream
            </button>
          )}
          {!isLive && (
            <button
              onClick={startLiveStream}
              disabled={isInitializing || !!error}
              className={`px-4 py-2 rounded-lg ${
                isInitializing || error
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              Go Live
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="text-red-500 p-4 bg-gray-900 rounded-lg mb-4">
          {error}
          <button
            onClick={() => {
              setError('');
              initializeStream();
            }}
            className="ml-4 text-blue-400 hover:text-blue-300"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Video Preview */}
      <div className="relative">
        <div 
          ref={videoRef} 
          className="w-full aspect-video bg-gray-900 rounded-lg"
        >
          {isInitializing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white">Initializing stream...</p>
            </div>
          )}
        </div>

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

          {/* Camera Selection */}
          <div className="mb-4">
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
          <div className="mb-4">
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
