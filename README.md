# Jigsaw Puzzle Helper

A web application that helps you solve jigsaw puzzles by matching pieces held to a camera against an uploaded reference image.

## Features

- **Real-time piece matching**: Hold a puzzle piece up to your camera and see where it belongs on the puzzle
- **Rotation-invariant**: Pieces can be held at any angle and will still match correctly
- **Multiple match candidates**: Shows all potential matches above confidence threshold
- **Interactive zoom**: Click on a match to zoom in and examine the region closely
- **Puzzle persistence**: Save and manage multiple puzzle images

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│  React Frontend │◄──────────────────►│ Python Backend   │
│  (Browser)      │                    │ (FastAPI + OpenCV)│
│                 │                    │                  │
│ • Camera capture│                    │ • Feature extract│
│ • UI/Display    │                    │ • Piece segment  │
│ • Match overlay │                    │ • SIFT matching  │
└─────────────────┘                    └──────────────────┘
```

## Requirements

### Backend
- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- OpenCV with SIFT support
- CUDA (optional, for GPU acceleration)

### Frontend
- Node.js 18+
- Modern browser with WebRTC support

## Setup

### 1. Backend Setup

```bash
cd backend

# Install dependencies and run (uv creates venv automatically)
uv run python main.py
```

Or to sync dependencies first:

```bash
cd backend
uv sync
uv run python main.py
```

The backend will start on `http://localhost:8000`.

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will start on `http://localhost:3000` and proxy API requests to the backend.

## Usage

1. **Upload a puzzle image**: Click "+ New" in the sidebar and upload an image of your completed puzzle (or the box cover).

2. **Position your camera**: Place a white mat/paper under your camera. The piece will be segmented from this white background.

3. **Hold pieces to camera**: Pick up a puzzle piece and hold it up to your camera. The matching regions will be highlighted on the puzzle image.

4. **Examine matches**: Click on any numbered match box to zoom in and examine the region closely. Use arrow keys or click the navigation buttons to switch between candidates.

5. **Resume scanning**: Close the zoom modal to resume live matching.

## Tips for Best Results

- **Good lighting**: Ensure even lighting to avoid shadows on the piece
- **White background**: Use a clean white surface (paper, mat) for best piece segmentation
- **Hold steady**: Keep the piece relatively still for the best match quality
- **Avoid fingers**: Try not to cover too much of the piece with your fingers
- **High-res puzzle image**: Use the highest resolution reference image available

## API Endpoints

### REST API

- `POST /api/puzzle/upload` - Upload a new puzzle image
- `GET /api/puzzles` - List all saved puzzles
- `GET /api/puzzle/{id}` - Get puzzle image
- `GET /api/puzzle/{id}/info` - Get puzzle metadata
- `DELETE /api/puzzle/{id}` - Delete a puzzle

### WebSocket

- `WS /ws/match/{puzzle_id}` - Stream video frames for real-time matching
  - Send: Binary JPEG data
  - Receive: JSON with match candidates

## Configuration

### Confidence Threshold

Edit `frontend/src/App.tsx` to adjust the confidence threshold:

```typescript
const CONFIDENCE_THRESHOLD = 0.3; // Lower = more matches, Higher = stricter
```

### Frame Rate

Edit the `frameInterval` prop in `App.tsx`:

```tsx
<CameraView frameInterval={200} /> // milliseconds between frames
```

## Troubleshooting

### Camera not working
- Ensure you've granted camera permissions in your browser
- Check if another application is using the camera
- Try using a different browser

### No matches found
- Ensure the piece is well-lit and clearly visible
- Check that the background is white/contrasting
- Try holding the piece closer or farther from the camera
- Lower the confidence threshold

### Slow performance
- Reduce the reference image size
- Increase the frame interval
- Ensure the backend is using GPU if available

## License

MIT
