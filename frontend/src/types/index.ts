export interface PuzzleInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  num_features: number;
}

export interface MatchPoint {
  framePt: [number, number];  // x, y on the camera frame
  refPt: [number, number];    // x, y on the reference image
  distance: number;           // match distance (lower = better)
}

export interface DebugInfo {
  frame_size?: [number, number];
  frame_keypoints: number;
  ref_keypoints: number;
  raw_matches: number;
  good_matches: number;
  stages: string[];
}

export interface MatchResult {
  matchPoints: MatchPoint[];
  processingTime: number;
  debug: DebugInfo;
  error?: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
