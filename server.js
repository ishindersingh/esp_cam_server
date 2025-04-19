const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store latest video frame and distance
let latestFrame = null;
let latestDistance = '0.0';
let latestServoAngle = 90;

// Middleware to parse URL-encoded data
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'image/jpeg', limit: '10mb' }));

// Serve static files (webpage)
app.use(express.static(path.join(__dirname, 'public')));

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
    res.status(400).send('Invalid angle');
  }
});

// Serve servo angle to ESP32-CAM
app.get('/servo', (req, res) => {
  res.status(200).send(String(latestServoAngle));
});

// Serve webpage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
