export interface PuzzleInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  num_features: number;
}

export interface MatchCandidate {
  id: number;
  bbox: [number, number, number, number]; // x, y, width, height
  center: [number, number];
  confidence: number;
  numMatches: number;
}

export interface MatchResult {
  matches: MatchCandidate[];
  processingTime: number;
  pieceDetected: boolean;
  error?: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
