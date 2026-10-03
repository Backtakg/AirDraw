# AirDraw ✦

Draw and write in the air using your webcam and hand tracking.

## Features

- Real-time index-finger tracking in the browser
- Pinch thumb + index finger to draw
- Multiple neon colors
- Air eraser
- Undo / redo
- Clear canvas
- Save artwork as PNG
- No backend or account required
- Camera processing stays in the browser

## Run

Because browsers restrict camera access on insecure origins, run the site through a local HTTPS server or deploy it to GitHub Pages.

For local development, any static server works. GitHub Pages is enough for the production site.

## Tech

- HTML
- CSS
- Vanilla JavaScript
- MediaPipe Tasks Vision
- Canvas 2D
- WebRTC camera API

The hand-tracking model and WASM runtime are loaded from public CDNs at runtime.
