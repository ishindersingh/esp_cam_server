const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store latest video frame, distance, and servo angle
let latestFrame = null;
let latestDistance = '0.0';
let latestServoAngle = 90;

// Enable CORS for Netlify domain (replace with your Netlify URL)
app.use(cors({
  origin: 'https://ishinders.me/espcam', // Update with your Netlify URL
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Middleware to parse URL-encoded and raw data
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'image/jpeg', limit: '10mb' }));

// Handle video frame from ESP32-CAM
app.post('/stream', (req, res) => {
  if (req.is('image/jpeg')) {
    latestFrame = req.body;
    // Broadcast frame to all connected WebSocket clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(latestFrame);
      }
    });
    res.status(200).send('Frame received');
  } else {
    res.status(400).send('Invalid content type');
  }
});

// Handle distance from ESP32-CAM
app.post('/distance', (req, res) => {
  const distance = req.body.distance;
  if (distance && !isNaN(distance)) {
    latestDistance = parseFloat(distance).toFixed(1);
    // Broadcast distance to all connected WebSocket clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ distance: latestDistance }));
      }
    });
    res.status(200).send('Distance received');
  } else {
    res.status(400).send('Invalid distance');
  }
});

// Handle servo command from webpage
app.get('/servo', (req, res) => {
  const angle = parseInt(req.query.angle);
  if (angle >= 0 && angle <= 180) {
    latestServoAngle = angle;
    res.status(200).send(String(angle));
  } else {
    // Allow ESP32-CAM to fetch latest angle without query
    res.status(200).send(String(latestServoAngle));
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).send('ESP32-CAM Server Running');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
