"""
FastAPI backend for Jigsaw Puzzle Helper.
Provides REST endpoints for puzzle management and WebSocket for real-time matching.
"""

import asyncio
import json
import os
import time
import uuid
from pathlib import Path
from typing import Dict, Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from matching import PuzzleMatcher, MatchCandidate
from segmentation import segment_piece_from_white_background, apply_mask_to_piece

# Configuration
SAVED_PUZZLES_DIR = Path(__file__).parent / "saved_puzzles"
PUZZLES_INDEX_FILE = SAVED_PUZZLES_DIR / "index.json"
MAX_IMAGE_SIZE = 2000  # Max dimension for reference images

# Ensure directories exist
SAVED_PUZZLES_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Jigsaw Puzzle Helper API")

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
puzzles_index: Dict[str, dict] = {}
matchers: Dict[str, PuzzleMatcher] = {}


class PuzzleInfo(BaseModel):
    id: str
    name: str
    width: int
    height: int
    num_features: int


def load_puzzles_index():
    """Load the puzzles index from disk."""
    global puzzles_index
    if PUZZLES_INDEX_FILE.exists():
        with open(PUZZLES_INDEX_FILE, "r") as f:
            puzzles_index = json.load(f)
    else:
        puzzles_index = {}


def save_puzzles_index():
    """Save the puzzles index to disk."""
    with open(PUZZLES_INDEX_FILE, "w") as f:
        json.dump(puzzles_index, f, indent=2)


def resize_image_if_needed(image: np.ndarray, max_size: int = MAX_IMAGE_SIZE) -> np.ndarray:
    """Resize image if it exceeds max_size in any dimension."""
    h, w = image.shape[:2]
    if max(h, w) <= max_size:
        return image

    scale = max_size / max(h, w)
    new_w = int(w * scale)
    new_h = int(h * scale)
    return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)


@app.on_event("startup")
async def startup():
    """Initialize on startup."""
    load_puzzles_index()

    # Pre-load matchers for existing puzzles
    for puzzle_id, info in puzzles_index.items():
        image_path = SAVED_PUZZLES_DIR / f"{puzzle_id}.jpg"
        if image_path.exists():
            image = cv2.imread(str(image_path))
            if image is not None:
                matcher = PuzzleMatcher()
                matcher.set_reference_image(image)
                matchers[puzzle_id] = matcher


@app.post("/api/puzzle/upload", response_model=PuzzleInfo)
async def upload_puzzle(file: UploadFile = File(...), name: Optional[str] = None):
    """
    Upload a new puzzle reference image.

    The image will be processed to extract SIFT features for matching.
    """
    # Read and decode image
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image file")

    # Resize if needed
    image = resize_image_if_needed(image)

    # Generate ID and save image
    puzzle_id = str(uuid.uuid4())[:8]
    image_path = SAVED_PUZZLES_DIR / f"{puzzle_id}.jpg"
    cv2.imwrite(str(image_path), image, [cv2.IMWRITE_JPEG_QUALITY, 95])

    # Create matcher and extract features
    matcher = PuzzleMatcher()
    num_features = matcher.set_reference_image(image)
    matchers[puzzle_id] = matcher

    # Determine name
    puzzle_name = name or file.filename or f"Puzzle {puzzle_id}"

    # Save to index
    h, w = image.shape[:2]
    puzzles_index[puzzle_id] = {
        "id": puzzle_id,
        "name": puzzle_name,
        "width": w,
        "height": h,
        "num_features": num_features,
    }
    save_puzzles_index()

    return PuzzleInfo(**puzzles_index[puzzle_id])


@app.get("/api/puzzles")
async def list_puzzles() -> list[PuzzleInfo]:
    """List all saved puzzles."""
    return [PuzzleInfo(**info) for info in puzzles_index.values()]


@app.get("/api/puzzle/{puzzle_id}")
async def get_puzzle(puzzle_id: str):
    """Get puzzle image by ID."""
    if puzzle_id not in puzzles_index:
        raise HTTPException(status_code=404, detail="Puzzle not found")

    image_path = SAVED_PUZZLES_DIR / f"{puzzle_id}.jpg"
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Puzzle image not found")

    return FileResponse(image_path, media_type="image/jpeg")


@app.get("/api/puzzle/{puzzle_id}/info")
async def get_puzzle_info(puzzle_id: str) -> PuzzleInfo:
    """Get puzzle metadata by ID."""
    if puzzle_id not in puzzles_index:
        raise HTTPException(status_code=404, detail="Puzzle not found")

    return PuzzleInfo(**puzzles_index[puzzle_id])


@app.delete("/api/puzzle/{puzzle_id}")
async def delete_puzzle(puzzle_id: str):
    """Delete a puzzle."""
    if puzzle_id not in puzzles_index:
        raise HTTPException(status_code=404, detail="Puzzle not found")

    # Remove image file
    image_path = SAVED_PUZZLES_DIR / f"{puzzle_id}.jpg"
    if image_path.exists():
        image_path.unlink()

    # Remove from index and matchers
    del puzzles_index[puzzle_id]
    if puzzle_id in matchers:
        del matchers[puzzle_id]

    save_puzzles_index()
    return {"status": "deleted"}


@app.websocket("/ws/match/{puzzle_id}")
async def websocket_match(websocket: WebSocket, puzzle_id: str):
    """
    WebSocket endpoint for real-time puzzle piece matching.

    Client sends: Binary JPEG image data (camera frame)
    Server sends: JSON with match candidates
    """
    await websocket.accept()

    # Verify puzzle exists
    if puzzle_id not in matchers:
        await websocket.send_json({"error": "Puzzle not found"})
        await websocket.close()
        return

    matcher = matchers[puzzle_id]

    try:
        while True:
            # Receive frame as binary data
            data = await websocket.receive_bytes()

            start_time = time.time()

            # Decode image
            nparr = np.frombuffer(data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is None:
                await websocket.send_json({"error": "Invalid frame", "matches": []})
                continue

            # Segment piece from white background
            piece, mask, bbox = segment_piece_from_white_background(frame)

            if piece is None:
                await websocket.send_json({
                    "matches": [],
                    "processingTime": int((time.time() - start_time) * 1000),
                    "pieceDetected": False,
                })
                continue

            # Apply mask and match
            masked_piece = apply_mask_to_piece(piece, mask)
            candidates = matcher.match_piece(masked_piece, mask)

            processing_time = int((time.time() - start_time) * 1000)

            # Send results
            await websocket.send_json({
                "matches": [
                    {
                        "id": c.id,
                        "bbox": list(c.bbox),
                        "center": list(c.center),
                        "confidence": round(c.confidence, 3),
                        "numMatches": c.num_matches,
                    }
                    for c in candidates
                ],
                "processingTime": processing_time,
                "pieceDetected": True,
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
