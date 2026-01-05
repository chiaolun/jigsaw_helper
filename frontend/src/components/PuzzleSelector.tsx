import { useCallback, useEffect, useState } from 'react';
import type { PuzzleInfo } from '../types';
import { PuzzleUpload } from './PuzzleUpload';

interface PuzzleSelectorProps {
  onSelect: (puzzle: PuzzleInfo) => void;
  selectedId: string | null;
}

export function PuzzleSelector({ onSelect, selectedId }: PuzzleSelectorProps) {
  const [puzzles, setPuzzles] = useState<PuzzleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  // Fetch puzzles list
  const fetchPuzzles = useCallback(async () => {
    try {
      const response = await fetch('/api/puzzles');
      if (response.ok) {
        const data: PuzzleInfo[] = await response.json();
        setPuzzles(data);
      }
    } catch (err) {
      console.error('Failed to fetch puzzles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPuzzles();
  }, [fetchPuzzles]);

  const handleUpload = useCallback((puzzle: PuzzleInfo) => {
    setPuzzles((prev) => [...prev, puzzle]);
    setShowUpload(false);
    onSelect(puzzle);
  }, [onSelect]);

  const handleDelete = useCallback(async (puzzleId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm('Delete this puzzle?')) return;

    try {
      await fetch(`/api/puzzle/${puzzleId}`, { method: 'DELETE' });
      setPuzzles((prev) => prev.filter((p) => p.id !== puzzleId));

      if (selectedId === puzzleId) {
        onSelect(puzzles.find((p) => p.id !== puzzleId) || puzzles[0]);
      }
    } catch (err) {
      console.error('Failed to delete puzzle:', err);
    }
  }, [selectedId, puzzles, onSelect]);

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading puzzles...
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Puzzles</h2>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
        >
          {showUpload ? 'Cancel' : '+ New'}
        </button>
      </div>

      {showUpload && (
        <div className="mb-4">
          <PuzzleUpload onUpload={handleUpload} />
        </div>
      )}

      {puzzles.length === 0 && !showUpload ? (
        <div className="text-center py-8">
          <p className="text-gray-500 mb-4">No puzzles yet</p>
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Upload Your First Puzzle
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {puzzles.map((puzzle) => (
            <div
              key={puzzle.id}
              onClick={() => onSelect(puzzle)}
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                selectedId === puzzle.id
                  ? 'bg-blue-100 border-2 border-blue-500'
                  : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
              }`}
            >
              {/* Thumbnail */}
              <img
                src={`/api/puzzle/${puzzle.id}`}
                alt={puzzle.name}
                className="w-16 h-16 object-cover rounded"
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{puzzle.name}</p>
                <p className="text-sm text-gray-500">
                  {puzzle.width} x {puzzle.height} |{' '}
                  {puzzle.num_features.toLocaleString()} features
                </p>
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(puzzle.id, e)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                title="Delete puzzle"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
