const WebSocket = require('ws');
const http = require('http');
const url = require('url');

// Create HTTP server for healthchecks
const server = http.createServer((req, res) => {
    const path = url.parse(req.url).pathname;
    
    if (path === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok', 
            clients: wss ? wss.clients.size : 0,
            uptime: process.uptime()
        }));
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Create WebSocket server
const wss = new WebSocket.Server({ 
    server,
    // Ping settings
    clientTracking: true,
    pingInterval: 30000,
    pingTimeout: 10000
});

// Client tracking
const clients = {
    python: null,
    browsers: new Set()
};

// Connection handler
wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`New client connected from ${ip}`);
    
    // Set up client properties
    ws.isAlive = true;
    ws.clientType = 'unknown';
    
    // Ping/pong for connection health checking
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    
    // Message handler
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`Received message type: ${data.type}`);
            
            // Identify client type
            if (data.type === 'python') {
                ws.clientType = 'python';
                clients.python = ws;
                console.log('Python client connected and registered');
                
                // Notify all browser clients that Python client is connected
                broadcastToBrowsers({
                    type: 'system',
                    message: 'Python controller connected',
                    pythonConnected: true
                });
                
            } else if (!ws.clientType || ws.clientType === 'unknown') {
                ws.clientType = 'browser';
                clients.browsers.add(ws);
                console.log('Browser client registered');
                
                // Send initial connection status
                ws.send(JSON.stringify({
                    type: 'system',
                    pythonConnected: clients.python !== null && clients.python.readyState === WebSocket.OPEN
                }));
            }
            
            // Handle message routing
            if (data.type === 'servo' && ws.clientType === 'browser') {
                // Forward servo commands from browser to Python
                if (clients.python && clients.python.readyState === WebSocket.OPEN) {
                    clients.python.send(message);
                    console.log(`Forwarded servo command: ${data.angle}° to Python client`);
                    
                    // Also broadcast to other browsers for UI consistency
                    broadcastToBrowsers(data, ws);
                } else {
                    // Let the browser know Python client is not available
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Python controller not connected',
                        originalCommand: data
                    }));
                }
            }
            
            // Forward distance data from Python to all browsers
            if (data.type === 'distance' && ws.clientType === 'python') {
                broadcastToBrowsers(data);
            }
            
            // Forward servo confirmation from Python to all browsers
            if (data.type === 'servo' && ws.clientType === 'python') {
                broadcastToBrowsers(data);
            }
            
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });
    
    // Handle disconnection
    ws.on('close', () => {
        console.log(`Client disconnected (type: ${ws.clientType})`);
        
        if (ws.clientType === 'python') {
            clients.python = null;
            // Notify all browsers that Python client disconnected
            broadcastToBrowsers({
                type: 'system',
                message: 'Python controller disconnected',
                pythonConnected: false
            });
        } else if (ws.clientType === 'browser') {
            clients.browsers.delete(ws);
        }
    });
    
    // Handle errors
    ws.on('error', (error) => {
        console.error(`WebSocket error for client (${ws.clientType}):`, error);
    });
});

// Broadcast to all browser clients
function broadcastToBrowsers(data, excludeWs = null) {
    clients.browsers.forEach((client) => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Connection health check interval
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log(`Terminating inactive client (type: ${ws.clientType})`);
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000);

// Clean up on server close
wss.on('close', () => {
    clearInterval(interval);
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
    console.log(`Health check endpoint: http://localhost:${PORT}/health`);
});

// Handle process termination
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server');
    wss.close(() => {
        console.log('WebSocket server closed');
        process.exit(0);
    });
});
