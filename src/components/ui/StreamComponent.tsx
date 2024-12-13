import React, { useRef, useEffect, useState } from 'react';

interface StreamComponentProps {
  onClose: () => void;
}

const StreamComponent: React.FC<StreamComponentProps> = ({ onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    // Request camera access
    navigator.mediaDevices.getUserMedia({ 
      video: true,
      audio: true 
    })
    .then(stream => {
      currentStream = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    })
    .catch(err => {
      setError('Could not access camera: ' + err.message);
    });

    // Cleanup function to stop all tracks when component unmounts
    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="w-full bg-gray-800 rounded-lg p-4 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-yellow-400">Your Live Stream</h2>
        <button 
          onClick={onClose}
          className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg"
        >
          End Stream
        </button>
      </div>
      {error ? (
        <div className="text-red-500 p-4 bg-gray-900 rounded-lg">{error}</div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full aspect-video bg-gray-900 rounded-lg"
        />
      )}
    </div>
  );
};

export default StreamComponent;