const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/cam' });

app.get('/', (req, res) => {
  res.send('WebSocket server for ESP32-CAM');
});

wss.on('connection', (ws) => {
  console.log('Client connected:', ws._socket.remoteAddress);

  ws.on('message', (data, isBinary) => {
    if (isBinary && Buffer.isBuffer(data)) {
      console.log(`Broadcasting frame: ${data.length} bytes`);
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: true }, (err) => {
            if (err) console.error('Send error:', err);
          });
        }
      });
    } else {
      console.log('Non-binary data:', data.toString());
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);
});
