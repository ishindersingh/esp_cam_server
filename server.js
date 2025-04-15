const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve index.html at /iot
app.get('/iot', (req, res) => {
  const filePath = path.join(__dirname, 'index.html');
  console.log('Attempting to serve:', filePath);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    console.error('File not found:', filePath);
    res.status(404).send('Error: index.html not found');
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (data) => {
    if (Buffer.isBuffer(data)) {
      console.log(`Received frame: ${data.length} bytes`);
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: true });
        }
      });
    } else {
      console.log('Received non-binary data:', data.toString());
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
