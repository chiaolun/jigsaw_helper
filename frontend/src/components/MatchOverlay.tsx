import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchCandidate, PuzzleInfo } from '../types';

interface MatchOverlayProps {
  puzzle: PuzzleInfo | null;
  matches: MatchCandidate[];
  onCandidateClick?: (candidate: MatchCandidate) => void;
}

export function MatchOverlay({ puzzle, matches, onCandidateClick }: MatchOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  // Calculate scale factor for mapping coordinates
  const scaleX = displaySize.width / (puzzle?.width || 1);
  const scaleY = displaySize.height / (puzzle?.height || 1);

  // Handle image load
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    setDisplaySize({ width: img.clientWidth, height: img.clientHeight });
    setImageLoaded(true);
  }, []);

  // Update display size on resize
  useEffect(() => {
    const handleResize = () => {
      const img = containerRef.current?.querySelector('img');
      if (img) {
        setDisplaySize({ width: img.clientWidth, height: img.clientHeight });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset on puzzle change
  useEffect(() => {
    setImageLoaded(false);
  }, [puzzle?.id]);

  if (!puzzle) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <p className="text-gray-500">No puzzle selected</p>
      </div>
    );
  }

  // Get color based on confidence
  const getMatchColor = (confidence: number): string => {
    if (confidence >= 0.7) return 'border-green-500 bg-green-500/20';
    if (confidence >= 0.5) return 'border-yellow-500 bg-yellow-500/20';
    return 'border-orange-500 bg-orange-500/20';
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-100 rounded-lg overflow-hidden">
      <img
        src={`/api/puzzle/${puzzle.id}`}
        alt={puzzle.name}
        className="w-full h-full object-contain"
        onLoad={handleImageLoad}
      />

      {/* Match overlays */}
      {imageLoaded && matches.map((match, index) => {
        const [x, y, w, h] = match.bbox;
        const scaledX = x * scaleX;
        const scaledY = y * scaleY;
        const scaledW = w * scaleX;
        const scaledH = h * scaleY;

        // Calculate offset for centering in container
        const containerWidth = containerRef.current?.clientWidth || 0;
        const containerHeight = containerRef.current?.clientHeight || 0;
        const offsetX = (containerWidth - displaySize.width) / 2;
        const offsetY = (containerHeight - displaySize.height) / 2;

        return (
          <div
            key={match.id}
            className={`absolute border-2 cursor-pointer transition-all hover:scale-105 ${getMatchColor(match.confidence)}`}
            style={{
              left: `${offsetX + scaledX}px`,
              top: `${offsetY + scaledY}px`,
              width: `${scaledW}px`,
              height: `${scaledH}px`,
            }}
            onClick={() => onCandidateClick?.(match)}
          >
            {/* Number label */}
            <div className="absolute -top-6 left-0 bg-black text-white text-sm font-bold px-2 py-0.5 rounded">
              {index + 1}
            </div>

            {/* Confidence badge */}
            <div className="absolute -bottom-6 left-0 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
              {Math.round(match.confidence * 100)}%
            </div>
          </div>
        );
      })}

      {/* No matches indicator */}
      {imageLoaded && matches.length === 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm">
          No matches found - hold piece to camera
        </div>
      )}
    </div>
  );
}
