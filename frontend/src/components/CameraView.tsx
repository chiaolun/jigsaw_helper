import { useEffect, useRef } from 'react';
import { useCamera } from '../hooks/useCamera';

interface CameraViewProps {
  onFrame?: (frame: Blob) => void;
  isActive: boolean;
  frameInterval?: number; // ms between frames
}

export function CameraView({ onFrame, isActive, frameInterval = 200 }: CameraViewProps) {
  const { videoRef, canvasRef, isReady, error, captureFrame, startCamera, stopCamera } = useCamera();
  const intervalRef = useRef<number | null>(null);

  // Start/stop camera based on isActive
  useEffect(() => {
    if (isActive) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [isActive, startCamera, stopCamera]);

  // Send frames at interval
  useEffect(() => {
    if (!isReady || !isActive || !onFrame) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      const frame = captureFrame();
      if (frame) {
        onFrame(frame);
      }
    }, frameInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isReady, isActive, onFrame, captureFrame, frameInterval]);

  return (
    <div className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden">
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/50 text-white p-4">
          <div className="text-center">
            <p className="font-semibold">Camera Error</p>
            <p className="text-sm mt-1">{error}</p>
            <button
              onClick={startCamera}
              className="mt-3 px-4 py-2 bg-white text-red-900 rounded hover:bg-gray-100"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!isReady && !error && isActive && (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-2">Starting camera...</p>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Status indicator */}
      {isReady && (
        <div className="absolute bottom-2 left-2 flex items-center gap-2 text-white text-sm bg-black/50 px-2 py-1 rounded">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span>Live</span>
        </div>
      )}
    </div>
  );
}
