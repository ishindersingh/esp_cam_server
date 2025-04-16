const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Store connected clients
let pythonClient = null;
let webClients = new Set();

// Serve static files (webpage)
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (message) => {
    try {
      // Handle binary data (video frames)
      if (Buffer.isBuffer(message)) {
        webClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message, { binary: true });
          }
        });
        return;
      }

      // Handle JSON data
      const data = JSON.parse(message);

      // Python client identification
      if (data.type === 'python') {
        pythonClient = ws;
        console.log('Python backend connected');
      } else if (data.type === 'web') {
        webClients.add(ws);
        console.log('Web client connected');
      }

      // Servo angle from web client
      if (data.type === 'servo' && pythonClient) {
        pythonClient.send(JSON.stringify({ type: 'servo', angle: data.angle }));
      }

      // Broadcast distance data from Python to web clients
      if (data.type === 'distance') {
        webClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'distance', distance: data.distance }));
          }
        });
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (ws === pythonClient) {
      pythonClient = null;
      console.log('Python backend disconnected');
    } else {
      webClients.delete(ws);
      console.log('Web client disconnected');
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
