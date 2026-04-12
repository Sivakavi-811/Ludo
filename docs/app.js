/**
 * LUDO KING — CLIENT APPLICATION
 * Handles board rendering, socket communication, UI state
 */

// =====================================================================
// BOARD LAYOUT CONSTANTS
// =====================================================================

const BOARD_SIZE = 560;
const CELL_SIZE = BOARD_SIZE / 15;  // 15x15 grid
const C = CELL_SIZE;

const COLORS = ['red', 'blue', 'green', 'yellow'];

const COLOR_MAP = {
  red: '#e83b3b',
  blue: '#3b6ae8',
  green: '#2ec060',
  yellow: '#e8c03b'
};

const COLOR_LIGHT = {
  red: '#ff8080',
  blue: '#80aaff',
  green: '#80e8a0',
  yellow: '#ffe080'
};

// Main track cells: array of [col, row] in the 15x15 grid
// Starting from red's entry (col=6, row=13 area), clockwise
const TRACK_CELLS = [
  // Bottom arm left col
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  // Left arm bottom row
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
  // Left arm top row
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  // Top arm left col
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  // Top arm right col
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  // Right arm top row
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  // Right arm bottom row
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  // Bottom arm right col
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14]
];

// Home column cells for each color (from entry toward home)
const HOME_COLS = {
  red: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]
};

// Base positions for each color (2x2 grid of tokens in base)
const BASE_TOKEN_POSITIONS = {
  red: [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]],
  blue: [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]],
  green: [[10.5, 10.5], [12.5, 10.5], [10.5, 12.5], [12.5, 12.5]],
  yellow: [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]]
};

// Home center piece
const HOME_CENTER = [7, 7];

// Safe cells indices
const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// =====================================================================
// STATE
// =====================================================================
let socket;
let mySocketId = null;
let myColor = null;
let gameState = null;
let roomId = null;
let animatingToken = null;

// Canvas
let canvas, ctx;

// =====================================================================
// INIT
// =====================================================================
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('ludo-board');
  ctx = canvas.getContext('2d');

  socket = io("https://ludo-9dtp.onrender.com");
  setupSocketEvents();
  setupUIEvents();
  drawBoard(null);
});

// =====================================================================
// UI EVENT SETUP
// =====================================================================
function setupUIEvents() {
  // Name Screen
  document.getElementById('btn-next').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    if (!name || name.length < 2) return showToast('Enter a name (2+ chars)', 'error');

    // Store temporarily in a JS variable instead of localStorage
    window.currentPlayerName = name;
    document.getElementById('display-user-name').textContent = name;
    showScreen('discovery');
    startRoomDiscovery();
  });

  document.getElementById('player-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-next').click();
  });

  document.getElementById('btn-change-name').addEventListener('click', () => {
    stopRoomDiscovery();
    showScreen('name');
  });

  // Discovery / Lobby Browser — player count selector
  let selectedPlayerCount = 4;
  let includeBots = true;

  document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPlayerCount = parseInt(btn.dataset.count);
    });
  });

  document.getElementById('bot-toggle-yes').addEventListener('click', () => {
    includeBots = true;
    document.getElementById('bot-toggle-yes').classList.add('active');
    document.getElementById('bot-toggle-no').classList.remove('active');
  });
  document.getElementById('bot-toggle-no').addEventListener('click', () => {
    includeBots = false;
    document.getElementById('bot-toggle-no').classList.add('active');
    document.getElementById('bot-toggle-yes').classList.remove('active');
  });

  document.getElementById('btn-create').addEventListener('click', () => {
    const name = window.currentPlayerName;
    socket.emit('create_room', {
      playerName: name,
      maxPlayers: selectedPlayerCount,
      includeBots: includeBots
    });
  });

  document.getElementById('btn-join').addEventListener('click', () => {
    const name = window.currentPlayerName;
    const code = document.getElementById('room-code').value.trim().toUpperCase();
    if (!code || code.length < 4) return showToast('Enter room code', 'error');
    socket.emit('join_room', { playerName: name, roomId: code });
  });

  document.getElementById('room-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-join').click();
  });

  // Lobby
  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = document.getElementById('lobby-room-id').textContent;
    navigator.clipboard?.writeText(code).then(() => showToast('Code copied!', 'success'));
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    socket.emit('start_game');
  });

  document.getElementById('btn-leave-lobby').addEventListener('click', () => {
    socket.emit('leave_room');
    location.reload();
  });

  document.getElementById('btn-leave-game').addEventListener('click', () => {
    if (confirm('Are you sure you want to quit the game?')) {
      socket.emit('leave_room');
      location.reload();
    }
  });

  // Game
  document.getElementById('btn-roll').addEventListener('click', () => {
    socket.emit('roll_dice');
  });

  canvas.addEventListener('click', onBoardClick);

  // Chat
  document.getElementById('btn-send-chat').addEventListener('click', sendChat);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendChat();
  });

  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('emoji_reaction', { emoji: btn.dataset.emoji });
    });
  });

  // Winner
  document.getElementById('btn-restart').addEventListener('click', () => {
    socket.emit('restart_game');
  });
  document.getElementById('btn-home').addEventListener('click', () => {
    location.reload();
  });
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chat_message', { message: msg });
  input.value = '';
}

// =====================================================================
// SOCKET EVENTS
// =====================================================================
function setupSocketEvents() {
  socket.on('connect', () => {
    mySocketId = socket.id;
  });

  socket.on('error', ({ message }) => {
    showToast(message, 'error');
  });

  socket.on('room_created', ({ roomId: id, room }) => {
    roomId = id;
    stopRoomDiscovery();
    showScreen('lobby');
    renderLobby(room);
    document.getElementById('btn-start').style.display = 'inline-block';
  });

  socket.on('room_joined', ({ roomId: id, room }) => {
    roomId = id;
    stopRoomDiscovery();
    showScreen('lobby');
    renderLobby(room);
  });

  socket.on('rooms_list', (rooms) => {
    renderDiscoveryRooms(rooms);
  });

  socket.on('player_joined', ({ room }) => {
    renderLobby(room);
    showToast(`${room.players[room.players.length - 1].name} joined!`);
  });

  socket.on('player_disconnected', ({ name }) => {
    showToast(`${name} disconnected`, 'error');
    addLogEntry(`${name} disconnected`);
  });

  socket.on('game_started', ({ gameState: gs, playerColors }) => {
    gameState = gs;
    const me = playerColors.find(p => p.socketId === mySocketId);
    if (me) myColor = me.color;
    showScreen('game');
    renderGameUI();
    drawBoard(gs);
    startTimerBar();
    addLogEntry('Game started!');
  });

  socket.on('game_state', (gs) => {
    gameState = gs;
    renderGameUI();
    drawBoard(gs);
    startTimerBar();
  });

  socket.on('dice_rolled', ({ color, dice, validMoves }) => {
    gameState.diceValue = dice;
    gameState.diceRolled = true;
    gameState.validMoves = validMoves;
    animateDice(dice);
    drawBoard(gameState);
    updateRollButton();
    addLogEntry(`${capColor(color)} rolled a ${dice}${validMoves.length === 0 ? ' (no moves)' : ''}`);
  });

  socket.on('token_moved', async ({ color, tokenIndex, oldPosition, newPosition, path, captured, dice }) => {
    // Animate move through path
    if (path && path.length > 0) {
      await animateJumpPath(color, tokenIndex, path);
    } else {
      gameState.tokens[color][tokenIndex].position = newPosition;
    }

    captured?.forEach(({ color: c, tokenIndex: ti }) => {
      gameState.tokens[c][ti].position = -1;
    });
    drawBoard(gameState);

    if (captured?.length > 0) {
      captured.forEach(({ color: c }) => {
        addLogEntry(`💥 ${capColor(color)} captured ${capColor(c)}!`);
        showToast(`${capColor(color)} captured ${capColor(c)}!`);
      });
    }

    if (newPosition === 200) {
      addLogEntry(`🏠 ${capColor(color)} coin reached home!`);
    }
  });

  socket.on('player_finished', ({ color, name, rank }) => {
    addLogEntry(`🏆 ${name} finished in rank #${rank}!`);
    showToast(`${name} finished in #${rank}!`);
  });

  socket.on('game_over', ({ rankings, tokens }) => {
    gameState.tokens = tokens;
    gameState.rankings = rankings;
    drawBoard(gameState);
    setTimeout(() => showWinnerScreen(rankings), 1200);
  });

  socket.on('chat_message', ({ name, color, message, time }) => {
    addChatMessage(name, color, message);
  });

  socket.on('emoji_reaction', ({ name, emoji }) => {
    showFloatingEmoji(emoji);
    addLogEntry(`${name}: ${emoji}`);
  });

  socket.on('turn_timeout', ({ color }) => {
    addLogEntry(`⏱️ ${capColor(color)}'s turn timed out`);
  });

  socket.on('game_restarted', ({ room }) => {
    gameState = null;
    myColor = null;
    showScreen('lobby');
    renderLobby(room);
  });
}

// =====================================================================
// DISCOVERY RENDER
// =====================================================================
let discoveryInterval = null;

function startRoomDiscovery() {
  socket.emit('get_rooms');
  discoveryInterval = setInterval(() => {
    socket.emit('get_rooms');
  }, 3000);
}

function stopRoomDiscovery() {
  clearInterval(discoveryInterval);
}

function renderDiscoveryRooms(rooms) {
  const container = document.getElementById('rooms-list');
  if (rooms.length === 0) {
    container.innerHTML = '<div class="rooms-empty">No active rooms found. Host one!</div>';
    return;
  }

  container.innerHTML = '';
  rooms.forEach(r => {
    const item = document.createElement('div');
    item.className = 'room-item';
    item.innerHTML = `
      <div class="room-info">
        <div class="room-host">${escHtml(r.host)}'s Room</div>
        <div class="room-meta">Code: <span class="room-id">${r.id}</span></div>
      </div>
      <div class="room-players-count">${r.players} / ${r.maxPlayers}</div>
    `;
    item.onclick = () => {
      const name = window.currentPlayerName;
      socket.emit('join_room', { playerName: name, roomId: r.id });
    };
    container.appendChild(item);
  });
}

// =====================================================================
// LOBBY RENDER
// =====================================================================
function renderLobby(room) {
  document.getElementById('lobby-room-id').textContent = room.id;
  console.log(`[Lobby] Joined room: ${room.id}`);

  const grid = document.getElementById('lobby-players');
  grid.innerHTML = '';
  const colorNames = ['Red', 'Blue', 'Green', 'Yellow'];
  const colorHex = ['#ff3333', '#3366ff', '#22cc66', '#ffcc00'];

  const max = room.maxPlayers || 4;
  for (let i = 0; i < max; i++) {
    const player = room.players[i];
    const isBot = player && player.type === 'bot';
    const slot = document.createElement('div');
    slot.className = `player-slot${player ? ' occupied' : ''}${isBot ? ' bot-slot' : ''}`;
    slot.innerHTML = `
      <div class="slot-color" style="background:${colorHex[i]}"></div>
      <div class="slot-name">${player ? (isBot ? '🤖 ' : '') + player.name : '—'}</div>
      <div class="slot-status">${player ? colorNames[i] : 'Waiting...'}</div>
    `;
    grid.appendChild(slot);
  }

  const count = room.players.length;
  document.getElementById('lobby-status').textContent =
    count < 2 ? `Need ${2 - count} more player(s)` :
      count < 4 ? `${count} players — Host can start` :
        'Room full — Starting soon!';
}

// =====================================================================
// GAME UI RENDER
// =====================================================================
function renderGameUI() {
  if (!gameState) return;

  // Player panels
  const panels = document.getElementById('player-panels');
  panels.innerHTML = '';
  gameState.players.forEach(p => {
    const isBot = p.type === 'bot';
    const nameLabel = (isBot ? '🤖 ' : '') + p.name + (p.color === myColor ? ' (You)' : '');
    const div = document.createElement('div');
    div.className = `player-panel${gameState.currentTurn === p.color ? ' active-turn' : ''}`;
    const homeCount = gameState.tokens[p.color].filter(t => t.position === 200).length;
    const onBoard = gameState.tokens[p.color].filter(t => t.position >= 0 && t.position !== 200).length;
    div.innerHTML = `
      <div class="panel-color color-${p.color}"></div>
      <div class="panel-info">
        <div class="panel-name">${nameLabel}</div>
        <div class="panel-tokens">🏠${homeCount} 🎯${onBoard}</div>
      </div>
      ${p.finished ? '<div class="panel-badge">#' + p.rank + '</div>' : ''}
      ${gameState.currentTurn === p.color ? '<div class="panel-badge">TURN</div>' : ''}
    `;
    panels.appendChild(div);
  });

  // Turn banner
  const cp = gameState.players.find(p => p.color === gameState.currentTurn);
  const cpBot = cp && cp.type === 'bot';
  const turnText = cp ? `${cpBot ? '🤖 ' : ''}${cp.name}${cp.color === myColor ? ' (You)' : ''}'s Turn` : '...';
  const turnEl = document.getElementById('turn-text');
  turnEl.textContent = turnText;
  turnEl.style.color = COLOR_LIGHT[gameState.currentTurn] || '#fff';

  // Roll button
  updateRollButton();

  // Game info
  document.getElementById('game-info-content').innerHTML = `
    <div style="margin-bottom:6px">Move #${gameState.moveCount || 0}</div>
    ${gameState.rankings.map(r => `<div style="font-size:11px;color:var(--c-muted)">#${r.rank} ${r.name}</div>`).join('')}
  `;

  // Dice display
  const diceEl = document.getElementById('dice');
  const faces = ['', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
  if (gameState.diceValue) {
    diceEl.textContent = faces[gameState.diceValue] || gameState.diceValue;
  } else {
    diceEl.textContent = '🎲';
  }
}

function updateRollButton() {
  const btn = document.getElementById('btn-roll');
  const isMyTurn = gameState && gameState.currentTurn === myColor;
  const canRoll = isMyTurn && !gameState.diceRolled;
  btn.disabled = !canRoll;
  btn.textContent = !isMyTurn ? "Waiting..." :
    gameState.diceRolled ? "Select Token" : "Roll Dice";
}

// =====================================================================
// TIMER BAR
// =====================================================================
let timerInterval = null;
let timerStart = null;
const TIMER_DURATION = 25000;

function startTimerBar() {
  clearInterval(timerInterval);
  timerStart = Date.now();
  const bar = document.getElementById('timer-bar');
  bar.style.transition = 'none';
  bar.style.width = '100%';
  setTimeout(() => {
    bar.style.transition = `width ${TIMER_DURATION}ms linear`;
    bar.style.width = '0%';
  }, 50);
}

// =====================================================================
// BOARD CLICK
// =====================================================================
function onBoardClick(e) {
  if (!gameState || !gameState.diceRolled || gameState.currentTurn !== myColor) return;
  if (!gameState.validMoves || gameState.validMoves.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  // Check if click is near any valid token
  const tokens = gameState.tokens[myColor];
  for (const move of gameState.validMoves) {
    const token = tokens[move.tokenIndex];
    const pos = getTokenCanvasPos(myColor, token.position, move.tokenIndex);
    const dx = mx - pos.x;
    const dy = my - pos.y;
    if (Math.sqrt(dx * dx + dy * dy) < C * 0.7) {
      socket.emit('move_token', { tokenIndex: move.tokenIndex });
      return;
    }
  }
}

// =====================================================================
// BOARD RENDERING
// =====================================================================
function drawBoard(gs) {
  ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  drawBoardBase();
  drawTrack();
  if (gs) drawTokens(gs);
  if (gs && gs.validMoves && gs.currentTurn === myColor && gs.diceRolled) {
    highlightValidMoves(gs);
  }
}

function drawBoardBase() {
  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  // Draw the 4 colored quadrants (base areas)
  const bases = [
    { color: '#e83b3b', x: 0, y: 9 * C, label: 'RED' },     // Bottom-Left
    { color: '#2ec060', x: 0, y: 0, label: 'GREEN' },   // Top-Left
    { color: '#e8c03b', x: 9 * C, y: 0, label: 'YELLOW' },  // Top-Right
    { color: '#3b6ae8', x: 9 * C, y: 9 * C, label: 'BLUE' }     // Bottom-Right
  ];

  bases.forEach(b => {
    // Outer fill
    ctx.fillStyle = b.color + '22';
    ctx.fillRect(b.x, b.y, 6 * C, 6 * C);

    // Border
    ctx.strokeStyle = b.color + '88';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, 6 * C - 2, 6 * C - 2);

    // Inner base circle area
    ctx.fillStyle = b.color + '33';
    const cx = b.x + 3 * C;
    const cy = b.y + 3 * C;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2 * C, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = b.color + '66';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw 4 empty token placeholders
    const offset = C * 1.25;
    const slotRadius = C * 0.38;
    for (let i = 0; i < 4; i++) {
      const bx = [-offset, offset, -offset, offset][i];
      const by = [-offset, -offset, offset, offset][i];

      ctx.beginPath();
      ctx.arc(cx + bx, cy + by, slotRadius + 2, 0, Math.PI * 2);
      ctx.fillStyle = b.color + '44';
      ctx.fill();
      ctx.strokeStyle = '#ffffff60'; // Soft white transparent ring
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // Track background
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      const isTrack = isTrackCell(col, row);
      if (isTrack) {
        ctx.fillStyle = '#252540';
        ctx.fillRect(col * C, row * C, C, C);
        ctx.strokeStyle = '#2e2e52';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(col * C, row * C, C, C);
      }
    }
  }



  // Home column coloring
  HOME_COLS.red.forEach(([c, r], i) => {
    if (i < 5) { ctx.fillStyle = '#e83b3b55'; ctx.fillRect(c * C, r * C, C, C); }
  });
  HOME_COLS.blue.forEach(([c, r], i) => {
    if (i < 5) { ctx.fillStyle = '#3b6ae855'; ctx.fillRect(c * C, r * C, C, C); }
  });
  HOME_COLS.green.forEach(([c, r], i) => {
    if (i < 5) { ctx.fillStyle = '#2ec06055'; ctx.fillRect(c * C, r * C, C, C); }
  });
  HOME_COLS.yellow.forEach(([c, r], i) => {
    if (i < 5) { ctx.fillStyle = '#e8c03b55'; ctx.fillRect(c * C, r * C, C, C); }
  });

  // Safe cell stars
  TRACK_CELLS.forEach(([c, r], idx) => {
    if (SAFE_INDICES.has(idx)) {
      ctx.fillStyle = '#ffffff20';
      ctx.fillRect(c * C, r * C, C, C);
      drawStar(c * C + C / 2, r * C + C / 2, C * 0.3, '#ffffff55');
    }
  });

  // Starting cells
  const startCells = [
    { idx: 0, color: '#e83b3b' }, // red
    { idx: 13, color: '#2ec060' }, // green
    { idx: 26, color: '#e8c03b' }, // yellow
    { idx: 39, color: '#3b6ae8' }  // blue
  ];
  startCells.forEach(sc => {
    const [c, r] = TRACK_CELLS[sc.idx];
    ctx.fillStyle = sc.color + '80';
    ctx.fillRect(c * C + 1, r * C + 1, C - 2, C - 2);
  });

  // Center home triangle
  drawCenterHome();
}

function drawCenterHome() {
  const cx = 7.5 * C;
  const cy = 7.5 * C;
  const s = 1.4 * C;

  // Draw 4 triangles pointing to center
  const triangles = [
    { color: '#e83b3b', points: [[cx - s, cy + s], [cx + s, cy + s], [cx, cy]] }, // Red (bottom pointing up)
    { color: '#3b6ae8', points: [[cx + s, cy - s], [cx + s, cy + s], [cx, cy]] },  // Blue (right pointing left)
    { color: '#e8c03b', points: [[cx - s, cy - s], [cx + s, cy - s], [cx, cy]] },  // Yellow (top pointing down)
    { color: '#2ec060', points: [[cx - s, cy - s], [cx - s, cy + s], [cx, cy]] }   // Green (left pointing right)
  ];

  triangles.forEach(tri => {
    ctx.beginPath();
    ctx.moveTo(...tri.points[0]);
    tri.points.slice(1).forEach(p => ctx.lineTo(...p));
    ctx.closePath();
    ctx.fillStyle = tri.color + 'cc';
    ctx.fill();
  });

  // Center star
  ctx.beginPath();
  ctx.arc(cx, cy, C * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = '#0d0d1a';
  ctx.fill();
  ctx.strokeStyle = '#f0c040';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawStar(cx, cy, C * 0.22, '#f0c040');
}

function drawTrack() {
  // Draw grid lines on track cells only
  ctx.strokeStyle = '#2e2e52';
  ctx.lineWidth = 0.5;
}

function isTrackCell(col, row) {
  // Columns 6-8 vertically (central vertical strip)
  if (col >= 6 && col <= 8 && row >= 0 && row <= 14) return true;
  // Rows 6-8 horizontally (central horizontal strip)
  if (row >= 6 && row <= 8 && col >= 0 && col <= 14) return true;
  return false;
}

function drawStar(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
    const ai = ((i * 4 + 2) * Math.PI / 5) - Math.PI / 2;
    if (i === 0) ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    else ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    ctx.lineTo(x + r * 0.4 * Math.cos(ai), y + r * 0.4 * Math.sin(ai));
  }
  ctx.closePath();
  ctx.fill();
}

function getTokenCanvasPos(color, position, tokenIndex) {
  if (position === -1) {
    // Base
    const offset = C * 1.25; // Good visual offset for token slots inside the base
    const bx = [-offset, offset, -offset, offset][tokenIndex];
    const by = [-offset, -offset, offset, offset][tokenIndex];
    // Base center for red is (3, 12), green is (3, 3), yellow is (12, 3), blue is (12, 12)
    const cx = color === 'red' ? 3 : color === 'green' ? 3 : color === 'yellow' ? 12 : 12;
    const cy = color === 'red' ? 12 : color === 'green' ? 3 : color === 'yellow' ? 3 : 12;
    return {
      x: cx * C + bx,
      y: cy * C + by
    };
  }
  if (position === 200) {
    // Home
    const cx = 7.5 * C;
    const cy = 7.5 * C;
    const offsets = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];
    return {
      x: cx + offsets[tokenIndex][0] * C,
      y: cy + offsets[tokenIndex][1] * C
    };
  }
  if (position >= 100 && position < 200) {
    // Home column
    const step = position - 100;
    const hcells = HOME_COLS[color];
    if (step < hcells.length) {
      const [c, r] = hcells[step];
      return { x: (c + 0.5) * C, y: (r + 0.5) * C };
    }
  }
  // Main track
  if (position >= 0 && position < TRACK_CELLS.length) {
    const [c, r] = TRACK_CELLS[position];
    return { x: (c + 0.5) * C, y: (r + 0.5) * C };
  }
  return { x: 0, y: 0 };
}

function drawTokens(gs) {
  const tokenRadius = C * 0.38;

  COLORS.forEach(color => {
    gs.tokens[color].forEach((token, idx) => {
      const pos = getTokenCanvasPos(color, token.position, idx);

      // Shadow
      ctx.beginPath();
      ctx.arc(pos.x + 3, pos.y + 3, tokenRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();

      // Outer glow/stroke
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, tokenRadius + 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Token body with gradient
      const grad = ctx.createRadialGradient(pos.x - 4, pos.y - 4, 1, pos.x, pos.y, tokenRadius);
      grad.addColorStop(0, COLOR_LIGHT[color]);
      grad.addColorStop(1, COLOR_MAP[color]);

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, tokenRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Inner decorative ring
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, tokenRadius * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Coin number
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${C * 0.3}px Rajdhani`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.fillText(idx + 1, pos.x, pos.y);
      ctx.shadowBlur = 0;
    });
  });
}

async function animateJumpPath(color, tokenIndex, path) {
  for (const pos of path) {
    await animateStep(color, tokenIndex, pos);
  }
}

function animateStep(color, tokenIndex, targetPos) {
  return new Promise(resolve => {
    const startPos = gameState.tokens[color][tokenIndex].position;
    const startCoord = getTokenCanvasPos(color, startPos, tokenIndex);
    const endCoord = getTokenCanvasPos(color, targetPos, tokenIndex);

    let startTime = null;
    const duration = 250; // ms per step

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);

      // Jump arc (sine wave)
      const jumpHeight = C * 0.8;
      const currentJump = Math.sin(progress * Math.PI) * jumpHeight;

      // Linear interpolation for X, Y
      const currentX = startCoord.x + (endCoord.x - startCoord.x) * progress;
      const currentY = startCoord.y + (endCoord.y - startCoord.y) * progress - currentJump;

      // Temporary state for drawing
      const tempTokens = JSON.parse(JSON.stringify(gameState.tokens));
      tempTokens[color][tokenIndex].position = -99; // Hide original

      drawBoard({ ...gameState, tokens: tempTokens });

      // Draw flying token
      drawSingleToken(color, tokenIndex, { x: currentX, y: currentY });

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        gameState.tokens[color][tokenIndex].position = targetPos;
        drawBoard(gameState);
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function drawSingleToken(color, tokenIndex, pos) {
  const tokenRadius = C * 0.42; // Slightly larger when jumping

  // Shadow
  ctx.beginPath();
  ctx.arc(pos.x + 6, pos.y + 10, tokenRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(pos.x, pos.y, tokenRadius + 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const grad = ctx.createRadialGradient(pos.x - 4, pos.y - 4, 1, pos.x, pos.y, tokenRadius);
  grad.addColorStop(0, COLOR_LIGHT[color]);
  grad.addColorStop(1, COLOR_MAP[color]);

  ctx.beginPath();
  ctx.arc(pos.x, pos.y, tokenRadius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${C * 0.3}px Rajdhani`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tokenIndex + 1, pos.x, pos.y);
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`screen-${name}`);
  if (target) target.classList.add('active');
}

function highlightValidMoves(gs) {
  const validTokenIndices = new Set(gs.validMoves.map(m => m.tokenIndex));

  gs.tokens[myColor].forEach((token, idx) => {
    if (!validTokenIndices.has(idx)) return;
    const pos = getTokenCanvasPos(myColor, token.position, idx);

    // Glowing ring
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, C * 0.46, 0, Math.PI * 2);
    ctx.strokeStyle = '#f0c040';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#f0c040';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
}

// =====================================================================
// DICE ANIMATION
// =====================================================================
function animateDice(value) {
  const dice = document.getElementById('dice');
  dice.classList.remove('rolling');
  void dice.offsetWidth; // reflow
  dice.classList.add('rolling');
  const faces = ['', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
  setTimeout(() => {
    dice.classList.remove('rolling');
    dice.textContent = faces[value] || value;
  }, 600);
}

// =====================================================================
// CHAT & LOG
// =====================================================================
function addChatMessage(name, color, message) {
  const el = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="msg-name" style="color:${COLOR_LIGHT[color] || '#ccc'}">${escHtml(name)}:</span>${escHtml(message)}`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function addLogEntry(text) {
  const el = document.getElementById('log-messages');
  if (!el) return;
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = text;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  if (el.children.length > 50) el.removeChild(el.firstChild);
}

// =====================================================================
// WINNER SCREEN
// =====================================================================
function showWinnerScreen(rankings) {
  showScreen('winner');
  const first = rankings[0];
  document.getElementById('winner-title').textContent = 'WINNER!';
  document.getElementById('winner-name').textContent = `🎉 ${first.name}`;
  document.getElementById('winner-name').style.color = COLOR_LIGHT[first.color] || '#fff';

  const list = document.getElementById('rankings-list');
  list.innerHTML = '';
  const medals = ['gold', 'silver', 'bronze', ''];
  rankings.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'ranking-row';
    div.innerHTML = `
      <div class="rank-num ${medals[i]}">#${r.rank}</div>
      <div class="rank-color" style="background:${COLOR_MAP[r.color] || '#ccc'}"></div>
      <div class="rank-name">${escHtml(r.name)}</div>
    `;
    list.appendChild(div);
  });
}

// =====================================================================
// FLOATING EMOJI
// =====================================================================
function showFloatingEmoji(emoji) {
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;
  el.style.left = (20 + Math.random() * 60) + 'vw';
  el.style.bottom = '20vh';
  document.getElementById('emoji-reactions').appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

// =====================================================================
// TOAST
// =====================================================================
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast${type ? ' ' + type : ''} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function capColor(c) {
  return `<span style="color:${COLOR_LIGHT[c] || '#ccc'};font-weight:700">${c.charAt(0).toUpperCase() + c.slice(1)}</span>`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
