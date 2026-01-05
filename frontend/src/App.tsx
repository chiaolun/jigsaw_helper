import { useCallback, useEffect, useState } from 'react';
import { CameraView } from './components/CameraView';
import { MatchOverlay } from './components/MatchOverlay';
import { CandidateZoom } from './components/CandidateZoom';
import { PuzzleSelector } from './components/PuzzleSelector';
import { useWebSocket } from './hooks/useWebSocket';
import type { MatchCandidate, PuzzleInfo, MatchResult } from './types';

const CONFIDENCE_THRESHOLD = 0.3;

function App() {
  // State
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleInfo | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [zoomedCandidate, setZoomedCandidate] = useState<MatchCandidate | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  // WebSocket connection
  const handleMatchResult = useCallback((result: MatchResult) => {
    // Filter matches by confidence threshold
    const filteredMatches = result.matches.filter(
      (m) => m.confidence >= CONFIDENCE_THRESHOLD
    );
    setMatches(filteredMatches);
    setProcessingTime(result.processingTime);
  }, []);

  const { status, sendFrame, connect } = useWebSocket({
    puzzleId: selectedPuzzle?.id || null,
    onMessage: handleMatchResult,
    autoConnect: true,
  });

  // Camera is active when: puzzle selected, connected, and not zoomed
  const isCameraActive = selectedPuzzle !== null && status === 'connected' && zoomedCandidate === null;

  // Handle puzzle selection
  const handlePuzzleSelect = useCallback((puzzle: PuzzleInfo) => {
    setSelectedPuzzle(puzzle);
    setMatches([]);
    setZoomedCandidate(null);
    // Save to localStorage
    localStorage.setItem('lastPuzzleId', puzzle.id);
  }, []);

  // Handle candidate click
  const handleCandidateClick = useCallback((candidate: MatchCandidate) => {
    setZoomedCandidate(candidate);
  }, []);

  // Handle zoom close
  const handleZoomClose = useCallback(() => {
    setZoomedCandidate(null);
  }, []);

  // Handle zoom navigation
  const handleZoomNavigate = useCallback((candidate: MatchCandidate) => {
    setZoomedCandidate(candidate);
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
        <main className="flex-1 flex gap-4 p-4">
          {/* Camera view */}
          <div className="flex-1 min-w-0">
            <CameraView
              onFrame={sendFrame}
              isActive={isCameraActive}
              frameInterval={200}
            />
          </div>

          {/* Puzzle with matches */}
          <div className="flex-1 min-w-0">
            <MatchOverlay
              puzzle={selectedPuzzle}
              matches={matches}
              onCandidateClick={handleCandidateClick}
            />
          </div>
        </main>
      </div>

      {/* Status bar */}
      <footer className="bg-gray-800 text-white px-4 py-2 text-sm flex items-center justify-between">
        <div>
          {selectedPuzzle ? (
            <span>
              Puzzle: <strong>{selectedPuzzle.name}</strong> |
              {matches.length} match{matches.length !== 1 ? 'es' : ''} found
            </span>
          ) : (
            <span className="text-gray-400">Select a puzzle to begin</span>
          )}
        </div>
        <div className="text-gray-400">
          Hold puzzle piece on white background
        </div>
      </footer>

      {/* Zoom modal */}
      {zoomedCandidate && selectedPuzzle && (
        <CandidateZoom
          puzzle={selectedPuzzle}
          candidate={zoomedCandidate}
          allCandidates={matches}
          onClose={handleZoomClose}
          onNavigate={handleZoomNavigate}
        />
      )}
    </div>
  );
}

export default App;
