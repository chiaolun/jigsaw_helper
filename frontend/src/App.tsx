import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraView } from './components/CameraView';
import { PuzzleSelector } from './components/PuzzleSelector';
import { useWebSocket } from './hooks/useWebSocket';
import type { MatchPoint, PuzzleInfo, MatchResult, DebugInfo } from './types';

function App() {
  // State
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleInfo | null>(null);
  const [matchPoints, setMatchPoints] = useState<MatchPoint[]>([]);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showDebug, setShowDebug] = useState(true);
  const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(null);

  // Refs for the visualization canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const puzzleImgRef = useRef<HTMLImageElement | null>(null);
  const frameImgRef = useRef<HTMLImageElement | null>(null);

  // WebSocket connection
  const handleMatchResult = useCallback((result: MatchResult) => {
    setMatchPoints(result.matchPoints || []);
    setDebugInfo(result.debug || null);
    setProcessingTime(result.processingTime);
  }, []);

  const { status, sendFrame } = useWebSocket({
    puzzleId: selectedPuzzle?.id || null,
    onMessage: handleMatchResult,
    autoConnect: true,
  });

  // Capture frame and store for visualization
  const handleFrame = useCallback((frame: Blob) => {
    // Send to backend
    sendFrame(frame);

    // Store for visualization
    const url = URL.createObjectURL(frame);
    setLastFrameUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, [sendFrame]);

  // Camera is active when puzzle selected and connected
  const isCameraActive = selectedPuzzle !== null && status === 'connected';

  // Handle puzzle selection
  const handlePuzzleSelect = useCallback((puzzle: PuzzleInfo) => {
    setSelectedPuzzle(puzzle);
    setMatchPoints([]);
    setDebugInfo(null);
    localStorage.setItem('lastPuzzleId', puzzle.id);
  }, []);

  // Load last puzzle from localStorage
  useEffect(() => {
    const lastPuzzleId = localStorage.getItem('lastPuzzleId');
    if (lastPuzzleId && !selectedPuzzle) {
      fetch(`/api/puzzle/${lastPuzzleId}/info`)
        .then((res) => res.ok ? res.json() : null)
        .then((puzzle: PuzzleInfo | null) => {
          if (puzzle) {
            setSelectedPuzzle(puzzle);
          }
        })
        .catch(() => {});
    }
  }, [selectedPuzzle]);

  // Load puzzle image
  useEffect(() => {
    if (!selectedPuzzle) {
      puzzleImgRef.current = null;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      puzzleImgRef.current = img;
    };
    img.src = `/api/puzzle/${selectedPuzzle.id}`;
  }, [selectedPuzzle]);

  // Load frame image when URL changes
  useEffect(() => {
    if (!lastFrameUrl) {
      frameImgRef.current = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      frameImgRef.current = img;
    };
    img.src = lastFrameUrl;
  }, [lastFrameUrl]);

  // Draw match visualization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frameImg = frameImgRef.current;
    const puzzleImg = puzzleImgRef.current;

    // Set canvas size
    const containerWidth = canvas.parentElement?.clientWidth || 800;
    const containerHeight = canvas.parentElement?.clientHeight || 400;
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    // Clear canvas
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!frameImg || !puzzleImg) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        frameImg ? 'Loading puzzle image...' : 'Waiting for camera frame...',
        canvas.width / 2,
        canvas.height / 2
      );
      return;
    }

    // Calculate layout: frame on left, puzzle on right
    const gap = 20;
    const availableWidth = (canvas.width - gap) / 2;
    const availableHeight = canvas.height;

    // Scale frame to fit left side
    const frameScale = Math.min(
      availableWidth / frameImg.width,
      availableHeight / frameImg.height
    );
    const frameW = frameImg.width * frameScale;
    const frameH = frameImg.height * frameScale;
    const frameX = (availableWidth - frameW) / 2;
    const frameY = (availableHeight - frameH) / 2;

    // Scale puzzle to fit right side
    const puzzleScale = Math.min(
      availableWidth / puzzleImg.width,
      availableHeight / puzzleImg.height
    );
    const puzzleW = puzzleImg.width * puzzleScale;
    const puzzleH = puzzleImg.height * puzzleScale;
    const puzzleX = availableWidth + gap + (availableWidth - puzzleW) / 2;
    const puzzleY = (availableHeight - puzzleH) / 2;

    // Draw images
    ctx.drawImage(frameImg, frameX, frameY, frameW, frameH);
    ctx.drawImage(puzzleImg, puzzleX, puzzleY, puzzleW, puzzleH);

    // Draw labels
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Camera Frame', availableWidth / 2, 20);
    ctx.fillText('Reference Image', puzzleX + puzzleW / 2, 20);

    // Draw match lines
    if (matchPoints.length > 0) {
      // Color gradient based on match distance
      const maxDist = Math.max(...matchPoints.map(m => m.distance), 1);

      matchPoints.forEach((match, i) => {
        // Frame point (left side)
        const fx = frameX + (match.framePt[0] / frameImg.width) * frameW;
        const fy = frameY + (match.framePt[1] / frameImg.height) * frameH;

        // Reference point (right side)
        const rx = puzzleX + (match.refPt[0] / puzzleImg.width) * puzzleW;
        const ry = puzzleY + (match.refPt[1] / puzzleImg.height) * puzzleH;

        // Color based on distance (green = good, red = bad)
        const t = match.distance / maxDist;
        const r = Math.round(255 * t);
        const g = Math.round(255 * (1 - t));
        const color = `rgb(${r}, ${g}, 100)`;

        // Draw line
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(rx, ry);
        ctx.stroke();

        // Draw keypoint circles
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(fx, fy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rx, ry, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw match count
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${matchPoints.length} matches`, 10, canvas.height - 10);
    }
  }, [matchPoints, lastFrameUrl, selectedPuzzle]);

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 text-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Jigsaw Puzzle Helper</h1>
        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                status === 'connected'
                  ? 'bg-green-500'
                  : status === 'connecting'
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-red-500'
              }`}
            />
            <span className="capitalize">{status}</span>
          </div>

          {/* Processing time */}
          {processingTime !== null && (
            <span className="text-sm text-gray-400">
              {processingTime}ms
            </span>
          )}

          {/* Toggle debug */}
          <button
            onClick={() => setShowDebug(!showDebug)}
            className={`px-3 py-1 text-sm rounded ${showDebug ? 'bg-blue-600' : 'bg-gray-600'}`}
          >
            Debug
          </button>

          {/* Toggle sidebar */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 hover:bg-gray-700 rounded"
            title="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {showSidebar && (
          <aside className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
            <PuzzleSelector
              onSelect={handlePuzzleSelect}
              selectedId={selectedPuzzle?.id || null}
            />
          </aside>
        )}

        {/* Main area */}
        <main className="flex-1 flex flex-col gap-2 p-4 overflow-hidden">
          {/* Hidden camera view (just for capturing frames) */}
          <div className="hidden">
            <CameraView
              onFrame={handleFrame}
              isActive={isCameraActive}
              frameInterval={300}
            />
          </div>

          {/* Match visualization canvas */}
          <div className="flex-1 relative">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
            />
          </div>

          {/* Debug panel */}
          {showDebug && (
            <div className="bg-gray-800 text-white p-3 rounded-lg text-sm font-mono overflow-auto max-h-48">
              <div className="font-bold mb-2 text-green-400">Debug Info</div>
              {debugInfo ? (
                <div className="space-y-1">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
                    <span className="text-gray-400">Frame size:</span>
                    <span>{debugInfo.frame_size ? `${debugInfo.frame_size[0]}x${debugInfo.frame_size[1]}` : 'N/A'}</span>
                    <span className="text-gray-400">Frame keypoints:</span>
                    <span className={debugInfo.frame_keypoints > 0 ? 'text-green-400' : 'text-red-400'}>
                      {debugInfo.frame_keypoints}
                    </span>
                    <span className="text-gray-400">Reference keypoints:</span>
                    <span className={debugInfo.ref_keypoints > 0 ? 'text-green-400' : 'text-red-400'}>
                      {debugInfo.ref_keypoints}
                    </span>
                    <span className="text-gray-400">Raw matches:</span>
                    <span>{debugInfo.raw_matches}</span>
                    <span className="text-gray-400">Good matches:</span>
                    <span className={debugInfo.good_matches > 0 ? 'text-green-400' : 'text-yellow-400'}>
                      {debugInfo.good_matches}
                    </span>
                  </div>
                  <div className="border-t border-gray-700 pt-2">
                    <div className="text-gray-400 mb-1">Processing stages:</div>
                    {debugInfo.stages.map((stage, i) => (
                      <div
                        key={i}
                        className={`pl-2 ${stage.includes('ERROR') ? 'text-red-400' : 'text-gray-300'}`}
                      >
                        {i + 1}. {stage}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-gray-500">No data yet. Start camera to see debug info.</div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Status bar */}
      <footer className="bg-gray-800 text-white px-4 py-2 text-sm flex items-center justify-between">
        <div>
          {selectedPuzzle ? (
            <span>
              Puzzle: <strong>{selectedPuzzle.name}</strong> |{' '}
              {matchPoints.length} SIFT matches
            </span>
          ) : (
            <span className="text-gray-400">Select a puzzle to begin</span>
          )}
        </div>
        <div className="text-gray-400">
          SIFT matching on full frame (no segmentation)
        </div>
      </footer>
    </div>
  );
}

export default App;
