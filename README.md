# Private Call

A small Zoom-like, two-person browser video-call app.

## Features
- Private room link, maximum 2 participants
- Camera and microphone
- Mute and camera controls
- Screen sharing
- Visible recording indicator for both participants
- Browser-side WebM recording download
- WebRTC peer-to-peer media with Socket.IO signaling

## Run locally
1. Install Node.js 18+.
2. In this folder run:
   npm install
   npm start
3. Open http://localhost:3000

For testing with another device, deploy the app over HTTPS.

## Production deployment
Deploy to a Node-compatible host that supports WebSockets. Configure HTTPS automatically through your host.

### Important: TURN
The demo uses a public STUN server. For reliable real-world calling, add your own TURN service (for example coturn) to the `iceServers` array in `public/app.js`. Without TURN, some corporate, carrier, or restrictive networks may fail to connect.

## Recording
Recording is initiated by a participant and the UI visibly tells both participants that recording is active. The resulting WebM file is downloaded locally in the recorder's browser. The server does not store recordings.

The simple recorder captures the remote video feed plus available local/remote audio. A production recording system that composites both video tiles should use a canvas-based compositor or server-side recording.

## Privacy/security notes
- Room IDs are random but are not user authentication.
- Add authentication/passwords and expiring room tokens before using this for sensitive calls.
- Use HTTPS/WSS in production.
- Recording/consent laws vary by jurisdiction; obtain appropriate consent before recording.
