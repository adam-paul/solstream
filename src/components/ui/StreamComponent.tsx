'use client'

import React, { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MediaDevices } from '@/types/agora';
import { agoraService } from '@/lib/agoraService';
import { useStreamStore } from '@/lib/StreamStore';
import { Mic, Video, MicOff, VideoOff, ChevronDown } from 'lucide-react';

interface StreamComponentProps {
  streamId: string;
  title: string;
  isLive: boolean;
}

const StreamComponent: React.FC<StreamComponentProps> = ({ streamId, title, isLive }) => {
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // States
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(false);
  const [devices, setDevices] = useState<MediaDevices | null>(null);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showVideoMenu, setShowVideoMenu] = useState(false);
  const [activeCamera, setActiveCamera] = useState<string | null>(null);
  const [activeMic, setActiveMic] = useState<string | null>(null);

  // StreamStore
  const { setStreamLiveStatus, endStream } = useStreamStore();

  useEffect(() => {
    const fetchDevices = async () => {
      const devices = await agoraService.fetchDevices();
      setDevices(devices);
    };
    fetchDevices();
  }, []);

  // Start stream when component mounts
  useEffect(() => {
    if (!videoRef.current) return;

    const startStream = async () => {
      try {
        await agoraService.startBroadcast(streamId, videoRef.current!);
      } catch (err) {
        console.error('Failed to start stream:', err);
      }
    };

    startStream();

    // Stop stream when component unmounts
    return () => {
      agoraService.stopBroadcast();
    };
  }, [streamId]);

  const handleEndStream = () => {
    agoraService.stopBroadcast();
    endStream(streamId);
    router.push('/');
  };

  const handleGoLive = async () => {
    try {
      await agoraService.goLive();
      setStreamLiveStatus(streamId, true);
    } catch (error) {
      console.error('Failed to go live:', error);
    }
  };

  return (
    <div className="w-full bg-gray-800 rounded-lg p-4 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-yellow-400">{title}</h2>
        <div className="flex gap-2">
          {!isLive && (
            <button 
              onClick={handleGoLive}
              className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg"
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
      <div className="relative w-full group overflow-hidden">
        <div 
          ref={videoRef} 
          className="w-full aspect-video bg-gray-900 rounded-lg"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent translate-y-full transform group-hover:translate-y-0 transition-transform duration-300 flex justify-center items-center gap-4 p-4"
          onMouseLeave={() => {
            setShowAudioMenu(false);
            setShowVideoMenu(false);
          }}
        >
          <div className="relative">
            <button
              onClick={async () => {
                const isMuted = await agoraService.toggleAudio();
                setIsAudioMuted(isMuted ?? isAudioMuted);
              }}
              className="bg-gray-800/80 hover:bg-gray-700/80 p-2 rounded-full transition-colors"
              aria-label="Toggle audio"
            >
              {isAudioMuted ? (
                <MicOff size={20} className="text-white" />
              ) : (
                <Mic size={20} className="text-white" />
              )}
            </button>
            <button
              onClick={() => {
                setShowVideoMenu(false);
                setShowAudioMenu(!showAudioMenu);
              }}
              className="absolute -bottom-1 -right-1 bg-gray-800/80 hover:bg-gray-700/80 p-1 rounded-full"
            >
              <ChevronDown size={12} className="text-white" />
            </button>
            
            {showAudioMenu && devices?.microphones && (
              <div 
                className="absolute bottom-full mb-2 left-0 bg-gray-800 rounded-lg p-2 min-w-[200px] shadow-lg"
                onBlur={() => setShowAudioMenu(false)}
              >
                {devices.microphones.map((mic) => (
                  <button
                    key={mic.deviceId}
                    onClick={() => {
                      agoraService.setAudioDevice(mic.deviceId);
                      setActiveMic(mic.deviceId);
                      setShowAudioMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-700 ${
                      activeMic === mic.deviceId ? 'bg-gray-700' : ''
                    }`}
                  >
                    {mic.label || `Microphone ${mic.deviceId.slice(0, 5)}...`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={async () => {
                const isMuted = await agoraService.toggleVideo();
                setIsVideoMuted(isMuted ?? isVideoMuted);
              }}
              className="bg-gray-800/80 hover:bg-gray-700/80 p-2 rounded-full transition-colors"
              aria-label="Toggle video"
            >
              {isVideoMuted ? (
                <VideoOff size={20} className="text-white" />
              ) : (
                <Video size={20} className="text-white" />
              )}
            </button>
            <button
              onClick={() => {
                setShowAudioMenu(false);
                setShowVideoMenu(!showVideoMenu);
              }}
              className="absolute -bottom-1 -right-1 bg-gray-800/80 hover:bg-gray-700/80 p-1 rounded-full"
            >
              <ChevronDown size={12} className="text-white" />
            </button>
            {showVideoMenu && devices?.cameras && (
              <div 
                className="absolute bottom-full mb-2 left-0 bg-gray-800 rounded-lg p-2 min-w-[200px] shadow-lg"
                onBlur={() => setShowVideoMenu(false)}
              >
                {devices.cameras.map((camera) => (
                  <button
                    key={camera.deviceId}
                    onClick={() => {
                      agoraService.setVideoDevice(camera.deviceId);
                      setActiveCamera(camera.deviceId);
                      setShowVideoMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-700 ${
                      activeCamera === camera.deviceId ? 'bg-gray-700' : ''
                    }`}
                  >
                    {camera.label || `Camera ${camera.deviceId.slice(0, 5)}...`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamComponent;
