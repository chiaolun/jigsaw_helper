"""
Puzzle piece segmentation from white background.
Extracts the puzzle piece region from a frame captured against a white mat.
"""

import cv2
import numpy as np
from typing import Optional, Tuple


def segment_piece_from_white_background(
    frame: np.ndarray,
    white_threshold: int = 200,
    min_area_ratio: float = 0.01,
    max_area_ratio: float = 0.8,
) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[Tuple[int, int, int, int]]]:
    """
    Segment a puzzle piece from a white background.

    Args:
        frame: BGR image from camera
        white_threshold: Pixel values above this are considered white background
        min_area_ratio: Minimum contour area as ratio of image size
        max_area_ratio: Maximum contour area as ratio of image size

    Returns:
        Tuple of:
        - Cropped piece image (BGR) or None if no piece found
        - Mask of the piece (binary) or None
        - Bounding box (x, y, w, h) or None
    """
    if frame is None or frame.size == 0:
        return None, None, None

    # Convert to grayscale
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Threshold: white background becomes white, piece becomes black
    # Then invert so piece is white (foreground)
    _, binary = cv2.threshold(blurred, white_threshold, 255, cv2.THRESH_BINARY_INV)

    # Morphological operations to clean up the mask
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)

    # Find contours
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None, None, None

    # Filter contours by area
    image_area = frame.shape[0] * frame.shape[1]
    min_area = image_area * min_area_ratio
    max_area = image_area * max_area_ratio

    valid_contours = [
        c for c in contours
        if min_area < cv2.contourArea(c) < max_area
    ]

    if not valid_contours:
        return None, None, None

    # Get the largest valid contour (assumed to be the puzzle piece)
    largest_contour = max(valid_contours, key=cv2.contourArea)

    # Create a mask for just this contour
    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.drawContours(mask, [largest_contour], -1, 255, -1)

    # Get bounding box
    x, y, w, h = cv2.boundingRect(largest_contour)

    # Add some padding
    padding = 10
    x = max(0, x - padding)
    y = max(0, y - padding)
    w = min(frame.shape[1] - x, w + 2 * padding)
    h = min(frame.shape[0] - y, h + 2 * padding)

    # Crop the piece and mask
    piece = frame[y:y+h, x:x+w].copy()
    piece_mask = mask[y:y+h, x:x+w].copy()

    return piece, piece_mask, (x, y, w, h)


def apply_mask_to_piece(piece: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Apply mask to piece image, setting background to transparent or black.

    Args:
        piece: BGR piece image
        mask: Binary mask (255 = piece, 0 = background)

    Returns:
        Masked piece image with background set to black
    """
    masked = cv2.bitwise_and(piece, piece, mask=mask)
    return masked


def get_piece_center(bbox: Tuple[int, int, int, int]) -> Tuple[int, int]:
    """Get center point of bounding box."""
    x, y, w, h = bbox
    return (x + w // 2, y + h // 2)
