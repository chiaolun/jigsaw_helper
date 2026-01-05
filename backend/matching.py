"""
Feature matching for puzzle pieces using SIFT/ORB.
Matches a puzzle piece against the reference puzzle image.
"""

import cv2
import numpy as np
from dataclasses import dataclass
from typing import List, Optional, Tuple


@dataclass
class MatchCandidate:
    """A candidate match location on the puzzle image."""
    id: int
    bbox: Tuple[int, int, int, int]  # x, y, width, height
    center: Tuple[int, int]
    confidence: float
    num_matches: int


@dataclass
class MatchPoint:
    """A single SIFT match between frame and reference."""
    frame_pt: Tuple[float, float]  # x, y on the camera frame
    ref_pt: Tuple[float, float]    # x, y on the reference image
    distance: float                 # match distance (lower = better)


class PuzzleMatcher:
    """
    Matches puzzle pieces against a reference image using SIFT features.
    SIFT is rotation and scale invariant, perfect for puzzle pieces.
    """

    def __init__(
        self,
        confidence_threshold: float = 0.3,
        ratio_threshold: float = 0.75,
        min_matches: int = 4,
        cluster_distance: int = 50,
    ):
        """
        Initialize the matcher.

        Args:
            confidence_threshold: Minimum confidence to report a match
            ratio_threshold: Lowe's ratio test threshold
            min_matches: Minimum number of feature matches for a valid candidate
            cluster_distance: Distance threshold for clustering matches
        """
        self.confidence_threshold = confidence_threshold
        self.ratio_threshold = ratio_threshold
        self.min_matches = min_matches
        self.cluster_distance = cluster_distance

        # SIFT detector
        self.sift = cv2.SIFT_create()

        # FLANN matcher for fast matching
        index_params = dict(algorithm=1, trees=5)  # FLANN_INDEX_KDTREE
        search_params = dict(checks=50)
        self.matcher = cv2.FlannBasedMatcher(index_params, search_params)

        # Reference image data
        self.reference_image: Optional[np.ndarray] = None
        self.reference_keypoints: Optional[List] = None
        self.reference_descriptors: Optional[np.ndarray] = None
        self.reference_size: Optional[Tuple[int, int]] = None

    def set_reference_image(self, image: np.ndarray) -> int:
        """
        Set the reference puzzle image and extract features.

        Args:
            image: BGR puzzle image

        Returns:
            Number of keypoints extracted
        """
        self.reference_image = image.copy()
        self.reference_size = (image.shape[1], image.shape[0])  # width, height

        # Convert to grayscale for feature extraction
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Extract SIFT features
        self.reference_keypoints, self.reference_descriptors = self.sift.detectAndCompute(gray, None)

        return len(self.reference_keypoints) if self.reference_keypoints else 0

    def match_piece(
        self,
        piece: np.ndarray,
        piece_mask: Optional[np.ndarray] = None,
        max_candidates: int = 10,
    ) -> List[MatchCandidate]:
        """
        Match a puzzle piece against the reference image.

        Args:
            piece: BGR image of the puzzle piece
            piece_mask: Optional mask for the piece (255 = piece area)
            max_candidates: Maximum number of candidates to return

        Returns:
            List of MatchCandidate objects, sorted by confidence (highest first)
        """
        if self.reference_descriptors is None:
            return []

        # Convert piece to grayscale
        gray_piece = cv2.cvtColor(piece, cv2.COLOR_BGR2GRAY)

        # Extract features from piece
        piece_keypoints, piece_descriptors = self.sift.detectAndCompute(gray_piece, piece_mask)

        if piece_descriptors is None or len(piece_descriptors) < self.min_matches:
            return []

        # Match features using KNN
        try:
            matches = self.matcher.knnMatch(piece_descriptors, self.reference_descriptors, k=2)
        except cv2.error:
            return []

        # Apply Lowe's ratio test
        good_matches = []
        for match_pair in matches:
            if len(match_pair) == 2:
                m, n = match_pair
                if m.distance < self.ratio_threshold * n.distance:
                    good_matches.append(m)

        if len(good_matches) < self.min_matches:
            return []

        # Get match positions on reference image
        match_positions = []
        for match in good_matches:
            ref_idx = match.trainIdx
            pt = self.reference_keypoints[ref_idx].pt
            match_positions.append((int(pt[0]), int(pt[1])))

        # Cluster matches to find candidate regions
        candidates = self._cluster_matches(match_positions, good_matches)

        # Filter by confidence threshold and sort
        candidates = [c for c in candidates if c.confidence >= self.confidence_threshold]
        candidates.sort(key=lambda c: c.confidence, reverse=True)

        # Limit to max candidates
        return candidates[:max_candidates]

    def _cluster_matches(
        self,
        positions: List[Tuple[int, int]],
        matches: List,
    ) -> List[MatchCandidate]:
        """
        Cluster match positions to find candidate regions.

        Uses a simple grid-based clustering approach.
        """
        if not positions:
            return []

        # Convert to numpy array
        points = np.array(positions, dtype=np.float32)

        # Use hierarchical clustering via OpenCV's partition
        # Simple approach: grid-based clustering
        grid_size = self.cluster_distance * 2

        # Group points by grid cell
        clusters = {}
        for i, (x, y) in enumerate(positions):
            cell = (x // grid_size, y // grid_size)
            if cell not in clusters:
                clusters[cell] = []
            clusters[cell].append((x, y, matches[i].distance))

        # Convert clusters to candidates
        candidates = []
        candidate_id = 1

        total_matches = len(matches)

        for cell, cell_matches in clusters.items():
            if len(cell_matches) < self.min_matches:
                continue

            # Calculate cluster center and bounds
            xs = [m[0] for m in cell_matches]
            ys = [m[1] for m in cell_matches]
            distances = [m[2] for m in cell_matches]

            center_x = int(np.mean(xs))
            center_y = int(np.mean(ys))

            # Estimate bounding box based on typical piece size
            # Assume piece is roughly 5-10% of image in each dimension
            piece_size = min(self.reference_size) // 8
            half_size = piece_size // 2

            x1 = max(0, center_x - half_size)
            y1 = max(0, center_y - half_size)
            x2 = min(self.reference_size[0], center_x + half_size)
            y2 = min(self.reference_size[1], center_y + half_size)

            # Calculate confidence based on:
            # 1. Number of matches in this cluster (more = better)
            # 2. Average match distance (lower = better)
            match_ratio = len(cell_matches) / total_matches
            avg_distance = np.mean(distances)
            distance_score = 1.0 / (1.0 + avg_distance / 100.0)

            confidence = match_ratio * 0.6 + distance_score * 0.4

            candidates.append(MatchCandidate(
                id=candidate_id,
                bbox=(x1, y1, x2 - x1, y2 - y1),
                center=(center_x, center_y),
                confidence=min(1.0, confidence),
                num_matches=len(cell_matches),
            ))
            candidate_id += 1

        return candidates

    def match_frame_raw(
        self,
        frame: np.ndarray,
        max_matches: int = 100,
    ) -> Tuple[List[MatchPoint], dict]:
        """
        Match a camera frame against the reference image and return raw match points.
        No segmentation - matches on the entire frame.

        Args:
            frame: BGR image from camera
            max_matches: Maximum number of matches to return

        Returns:
            Tuple of:
            - List of MatchPoint objects
            - Debug info dict with stage details
        """
        debug_info = {
            "frame_size": (frame.shape[1], frame.shape[0]) if frame is not None else None,
            "frame_keypoints": 0,
            "ref_keypoints": len(self.reference_keypoints) if self.reference_keypoints else 0,
            "raw_matches": 0,
            "good_matches": 0,
            "stages": [],
        }

        if self.reference_descriptors is None:
            debug_info["stages"].append("ERROR: No reference image loaded")
            return [], debug_info

        debug_info["stages"].append(f"Reference loaded: {debug_info['ref_keypoints']} keypoints")

        if frame is None or frame.size == 0:
            debug_info["stages"].append("ERROR: Empty frame received")
            return [], debug_info

        # Convert frame to grayscale
        gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        debug_info["stages"].append(f"Frame converted to grayscale: {gray_frame.shape}")

        # Extract features from frame
        frame_keypoints, frame_descriptors = self.sift.detectAndCompute(gray_frame, None)
        debug_info["frame_keypoints"] = len(frame_keypoints) if frame_keypoints else 0
        debug_info["stages"].append(f"Frame SIFT: {debug_info['frame_keypoints']} keypoints extracted")

        if frame_descriptors is None or len(frame_descriptors) < 2:
            debug_info["stages"].append("ERROR: Not enough keypoints in frame")
            return [], debug_info

        # Match features using KNN
        try:
            matches = self.matcher.knnMatch(frame_descriptors, self.reference_descriptors, k=2)
            debug_info["raw_matches"] = len(matches)
            debug_info["stages"].append(f"KNN matching: {len(matches)} raw matches")
        except cv2.error as e:
            debug_info["stages"].append(f"ERROR: KNN matching failed: {e}")
            return [], debug_info

        # Apply Lowe's ratio test
        good_matches = []
        for match_pair in matches:
            if len(match_pair) == 2:
                m, n = match_pair
                if m.distance < self.ratio_threshold * n.distance:
                    good_matches.append(m)

        debug_info["good_matches"] = len(good_matches)
        debug_info["stages"].append(f"Lowe's ratio test: {len(good_matches)} good matches (threshold={self.ratio_threshold})")

        if len(good_matches) == 0:
            debug_info["stages"].append("No matches passed ratio test")
            return [], debug_info

        # Sort by distance and limit
        good_matches.sort(key=lambda m: m.distance)
        good_matches = good_matches[:max_matches]

        # Convert to MatchPoint objects
        match_points = []
        for match in good_matches:
            frame_pt = frame_keypoints[match.queryIdx].pt
            ref_pt = self.reference_keypoints[match.trainIdx].pt
            match_points.append(MatchPoint(
                frame_pt=(round(frame_pt[0], 1), round(frame_pt[1], 1)),
                ref_pt=(round(ref_pt[0], 1), round(ref_pt[1], 1)),
                distance=round(match.distance, 2),
            ))

        debug_info["stages"].append(f"Returning {len(match_points)} match points")
        return match_points, debug_info

    def get_reference_size(self) -> Optional[Tuple[int, int]]:
        """Get the reference image size (width, height)."""
        return self.reference_size

    def has_reference(self) -> bool:
        """Check if a reference image is loaded."""
        return self.reference_descriptors is not None
