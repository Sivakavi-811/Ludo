/**
 * LUDO MULTIPLAYER SERVER
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const setupSocketHandler = require('./socketHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Serve static client files
app.use(express.static(path.join(__dirname, '../client')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Setup socket events
setupSocketHandler(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎲 Ludo Multiplayer running on http://localhost:${PORT}`);
});
