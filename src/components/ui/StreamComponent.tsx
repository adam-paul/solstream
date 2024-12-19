'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Mic, Video, VideoOff, MicOff, Settings } from 'lucide-react';
import { agoraService } from '@/lib/agoraService';
import { useInitializedStreamStore } from '@/lib/StreamStore';
import { DEFAULT_PREVIEW_CONFIG } from '@/config/preview';
import { streamLifecycle, StreamState, type StreamStateType } from '@/lib/streamLifecycle';

interface StreamComponentProps {
  streamId: string;
}

interface StreamControls {
  videoEnabled: boolean;
  audioEnabled: boolean;
  selectedCamera: string;
  selectedMicrophone: string;
}

const StreamComponent: React.FC<StreamComponentProps> = ({
  streamId
}) => {
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const previewIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const mountedRef = useRef<boolean>(true);
  
  // State
  const [error, setError] = useState<string>('');
  const [streamState, setStreamState] = useState<StreamStateType>(StreamState.INITIALIZING);
  const [isPreLaunch, setIsPreLaunch] = useState<boolean>(true);
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
  const [showSettings, setShowSettings] = useState(false);

  // Get store methods
  const {
    getStream,
    endStream,
    updatePreview,
    broadcastStream
  } = useInitializedStreamStore();
  
  const stream = getStream(streamId);

  // Preview capture functionality
  const capturePreview = useCallback(async () => {
    if (!videoRef.current || !mountedRef.current || !streamLifecycle.isPreviewEnabled(streamId)) return;

    try {
      const video = videoRef.current.querySelector('video');
      if (!video || video.readyState < 2) return; // Wait for video to be ready

      const canvas = document.createElement('canvas');
      const scaleFactor = 0.5;
      canvas.width = video.videoWidth * scaleFactor;
      canvas.height = video.videoHeight * scaleFactor;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const previewUrl = canvas.toDataURL('image/jpeg', 0.8);

      if (previewUrl.length <= 200000 && mountedRef.current) {
        updatePreview(streamId, previewUrl);
      }

      canvas.remove();
    } catch (error) {
      console.error('Preview capture error:', error);
    }
  }, [streamId, updatePreview]);

  const startPreviewCaptures = useCallback(() => {
    if (!mountedRef.current) return;

    // Clear any existing interval
    if (previewIntervalRef.current) {
      clearInterval(previewIntervalRef.current);
    }

    // Initial capture with retry
    const attemptInitialCapture = () => {
      capturePreview().catch(console.error);
    };
    
    setTimeout(attemptInitialCapture, DEFAULT_PREVIEW_CONFIG.initialDelay);

    // Regular captures
    previewIntervalRef.current = setInterval(
      capturePreview,
      DEFAULT_PREVIEW_CONFIG.updateInterval
    );
  }, [capturePreview]);

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
      setError(error instanceof Error ? error.message : 'Failed to change device');
    }
  }, []);

  // Handle stream start
  const startLiveStream = useCallback(async () => {
    try {
      setError('');
      
      // Core stream startup
      await streamLifecycle.startStream(streamId);
      await broadcastStream(streamId);
      
      // If we get here, stream is successfully live
      setIsPreLaunch(false);
      setStreamState(StreamState.LIVE);
  
      // Handle preview separately - failures don't affect stream
      try {
        await capturePreview();
        // Start preview captures in background
        setTimeout(startPreviewCaptures, 5000);
      } catch (previewError) {
        // Just log preview errors, don't affect stream state
        console.warn('[StreamComponent] Preview capture failed:', previewError);
      }
    } catch (error) {
      // Only handle errors from core streaming
      console.error('[StreamComponent] Failed to start stream:', error);
      setError(error instanceof Error ? error.message : 'Failed to start stream');
      setStreamState(StreamState.ERROR);
      
      // Cleanup only if core streaming failed
      try {
        await streamLifecycle.cleanup(streamId);
      } catch (cleanupError) {
        console.error('[StreamComponent] Cleanup failed:', cleanupError);
      }
    }
  }, [streamId, broadcastStream, capturePreview, startPreviewCaptures]);

  // Handle stream end
  const handleEndStream = useCallback(async () => {
    try {
      setError('');
      // First set state to cleanup to prevent any new operations
      setStreamState(StreamState.CLEANUP);
      
      // Clear any preview intervals
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
      
      // Clean up stream lifecycle first
      await streamLifecycle.cleanup(streamId);
      
      // Then end the stream in the store
      endStream(streamId);
      
      // Finally redirect to home
      window.location.href = '/';
    } catch (error) {
      console.error('[StreamComponent] Error ending stream:', error);
      setError(error instanceof Error ? error.message : 'Failed to end stream');
      // Even if cleanup fails, try to redirect
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    }
  }, [streamId, endStream]);

  // Effect for initialization
  useEffect(() => {
    mountedRef.current = true;

    if (!stream || !videoRef.current) return;

    const initialize = async () => {
      try {
        // Get available devices
        const availableDevices = await agoraService.getDevices();
        if (!mountedRef.current || !videoRef.current) return;
        
        setDevices(availableDevices);
        setControls(prev => ({
          ...prev,
          selectedCamera: prev.selectedCamera || availableDevices.cameras[0]?.deviceId || '',
          selectedMicrophone: prev.selectedMicrophone || availableDevices.microphones[0]?.deviceId || ''
        }));

        // Initialize stream
        await streamLifecycle.initializeStream(stream, videoRef.current, 'host');
        setStreamState(StreamState.READY);
        setIsPreLaunch(true); // Ensure we start in pre-launch mode
      } catch (error) {
        if (mountedRef.current) {
          setError(error instanceof Error ? error.message : 'Failed to initialize stream');
        }
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
      streamLifecycle.cleanup(streamId).catch(console.error);
    };
  }, [stream, streamId]);

  // Effect for preview captures - only start when not in pre-launch
  useEffect(() => {
    if (!isPreLaunch && streamState === StreamState.LIVE) {
      // Don't start preview captures immediately, give a delay
      const timer = setTimeout(startPreviewCaptures, 5000);
      return () => {
        clearTimeout(timer);
        if (previewIntervalRef.current) {
          clearInterval(previewIntervalRef.current);
        }
      };
    }
    return () => {
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
    };
  }, [isPreLaunch, streamState, startPreviewCaptures]);

  // Device change listener
  useEffect(() => {
    const handleDevicesChanged = () => {
      agoraService.getDevices()
        .then(devices => {
          if (mountedRef.current) {
            setDevices(devices);
          }
        })
        .catch(error => console.error('Error updating devices:', error));
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDevicesChanged);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDevicesChanged);
    };
  }, []);

  if (!stream) return null;

  const isInitializing = streamState === StreamState.INITIALIZING;
  const isLive = streamState === StreamState.LIVE && !isPreLaunch;

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
          {!isLive && streamState === StreamState.READY && (
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
          <button
            onClick={() => {
              setError('');
              if (videoRef.current) {
                streamLifecycle.initializeStream(stream, videoRef.current);
              }
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
