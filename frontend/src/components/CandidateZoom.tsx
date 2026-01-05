import { useEffect, useRef, useState } from 'react';
import type { MatchCandidate, PuzzleInfo } from '../types';

interface CandidateZoomProps {
  puzzle: PuzzleInfo;
  candidate: MatchCandidate;
  allCandidates: MatchCandidate[];
  onClose: () => void;
  onNavigate: (candidate: MatchCandidate) => void;
}

export function CandidateZoom({
  puzzle,
  candidate,
  allCandidates,
  onClose,
  onNavigate,
}: CandidateZoomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const currentIndex = allCandidates.findIndex((c) => c.id === candidate.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allCandidates.length - 1;

  // Load and crop image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.src = `/api/puzzle/${puzzle.id}`;

    return () => {
      img.onload = null;
    };
  }, [puzzle.id]);

  // Draw zoomed region
  useEffect(() => {
    if (!imageLoaded || !canvasRef.current || !imageRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageRef.current;
    const [x, y, w, h] = candidate.bbox;

    // Add padding around the match region
    const padding = Math.max(w, h) * 0.5;
    const srcX = Math.max(0, x - padding);
    const srcY = Math.max(0, y - padding);
    const srcW = Math.min(img.naturalWidth - srcX, w + padding * 2);
    const srcH = Math.min(img.naturalHeight - srcY, h + padding * 2);

    // Set canvas size maintaining aspect ratio
    const maxSize = 500;
    const scale = Math.min(maxSize / srcW, maxSize / srcH);
    canvas.width = srcW * scale;
    canvas.height = srcH * scale;

    // Draw cropped region
    ctx.drawImage(
      img,
      srcX,
      srcY,
      srcW,
      srcH,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Draw match box
    const boxX = (x - srcX) * scale;
    const boxY = (y - srcY) * scale;
    const boxW = w * scale;
    const boxH = h * scale;

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
  }, [imageLoaded, candidate, puzzle]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrev) {
        onNavigate(allCandidates[currentIndex - 1]);
      } else if (e.key === 'ArrowRight' && hasNext) {
        onNavigate(allCandidates[currentIndex + 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNavigate, currentIndex, allCandidates, hasPrev, hasNext]);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-4 max-w-[90vw] max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg">
              Match #{currentIndex + 1} of {allCandidates.length}
            </h3>
            <p className="text-sm text-gray-600">
              Confidence: {Math.round(candidate.confidence * 100)}% |
              Feature matches: {candidate.numMatches}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Canvas */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="border border-gray-200 rounded"
          />

          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="animate-spin w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full"></div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => hasPrev && onNavigate(allCandidates[currentIndex - 1])}
            disabled={!hasPrev}
            className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>

          <div className="flex gap-2">
            {allCandidates.map((c, i) => (
              <button
                key={c.id}
                onClick={() => onNavigate(c)}
                className={`w-8 h-8 rounded-full text-sm font-bold transition-colors ${
                  c.id === candidate.id
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button
            onClick={() => hasNext && onNavigate(allCandidates[currentIndex + 1])}
            disabled={!hasNext}
            className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>

        <p className="text-center text-sm text-gray-500 mt-3">
          Press Esc to close, or use arrow keys to navigate
        </p>
      </div>
    </div>
  );
}
