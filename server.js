const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

// Create Express app
const app = express();
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server: server, 
  path: '/cam',
  perMessageDeflate: false // Disable compression for binary image data
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the HTML viewer page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store connected clients
const clients = new Set();
let lastImageBuffer = null;
let cameraConnected = false;

// WebSocket server event handlers
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`Client connected: ${ip}`);
  
  // Add the client to our set
  clients.add(ws);
  
  // Send last frame immediately if available
  if (lastImageBuffer && ws !== clients.values().next().value) {
    ws.send(lastImageBuffer, { binary: true }, (err) => {
      if (err) console.error('Error sending cached frame:', err);
    });
  }
  
  // Handle incoming messages
  ws.on('message', (data, isBinary) => {
    // If this is binary data and the sender is the first client (ESP32-CAM)
    if (isBinary && ws === clients.values().next().value) {
      // First client is assumed to be the ESP32-CAM
      if (!cameraConnected) {
        console.log('ESP32-CAM connected and sending frames');
        cameraConnected = true;
      }
      
      // Store the latest frame
      lastImageBuffer = data;
      
      // Log frame size periodically (not every frame)
      if (Math.random() < 0.05) { // Log about 5% of frames
        console.log(`Received frame: ${data.length} bytes`);
      }
      
      // Broadcast to all other clients (viewers)
      let viewerCount = 0;
      clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: true }, (err) => {
            if (err) console.error('Error broadcasting frame:', err);
          });
          viewerCount++;
        }
      });
      
      // Log active viewers periodically
      if (Math.random() < 0.01) { // Log less frequently
        console.log(`Active viewers: ${viewerCount}`);
      }
    } 
    // Handle text commands from viewers
    else if (!isBinary) {
      const command = data.toString();
      console.log(`Received command: ${command}`);
      
      // Forward commands to the ESP32-CAM (first client)
      const cameraClient = clients.values().next().value;
      if (cameraClient && cameraClient.readyState === WebSocket.OPEN) {
        cameraClient.send(command);
        console.log(`Forwarded command to ESP32-CAM: ${command}`);
      }
    }
  });
  
  // Handle client disconnection
  ws.on('close', () => {
    console.log(`Client disconnected: ${ip}`);
    clients.delete(ws);
    
    // Check if the camera disconnected
    if (ws === clients.values().next().value) {
      console.log('ESP32-CAM disconnected');
      cameraConnected = false;
    }
  });
  
  // Handle errors
  ws.on('error', (err) => {
    console.error(`WebSocket error for ${ip}:`, err);
    clients.delete(ws);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    cameraConnected: cameraConnected,
    viewers: clients.size - (cameraConnected ? 1 : 0),
    uptime: process.uptime()
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
