/**
 * socketHandler.js
 * All Socket.IO event handlers. Manages rooms, lobbies, and game flow.
 */

const {
  createGameState,
  rollDice,
  getValidMoves,
  applyMove,
  checkWin,
  getNextPlayer,
  chooseBotMove,
  COLORS,
} = require('./gameLogic');

const sanitizeName = (n) => n?.toString().trim().slice(0, 20) || '';
const deepClone = (o) => JSON.parse(JSON.stringify(o));

const TURN_TIMEOUT_MS = 20000; // 20 seconds per turn

// In-memory store: roomId -> room object
const rooms = new Map();

module.exports = function registerSocketHandlers(io) {

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ── Create Room ────────────────────────────────────────────────────────
    socket.on('create_room', ({ playerName, maxPlayers, includeBots }) => {
      const name = sanitizeName(playerName);
      const roomId = generateRoomId();
      const max = Math.min(Math.max(parseInt(maxPlayers) || 4, 2), 4);

      const room = {
        id: roomId,
        maxPlayers: max,
        players: [],
        game: null,
        chat: [],
        turnTimer: null,
        turnTimerInterval: null,
        hasBots: !!includeBots,
      };

      const color = COLORS[0];
      const player = { id: socket.id, name, color, connected: true, type: 'human' };
      room.players.push(player);

      // Fill remaining slots with bots if requested
      if (includeBots) {
        const botNames = ['Bot Alpha', 'Bot Beta', 'Bot Gamma'];
        for (let i = 1; i < max; i++) {
          room.players.push({
            id: `bot_${i}`,
            name: botNames[i - 1] || `Bot ${i}`,
            color: COLORS[i],
            connected: true,
            type: 'bot',
          });
        }
      }

      rooms.set(roomId, room);

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.color = color;

      socket.emit('room_created', { roomId, room });
      console.log(`[Room] Created ${roomId} by ${name}${includeBots ? ` (+${max-1} bots)` : ''}`);
    });

    // ── Join Room ──────────────────────────────────────────────────────────
    socket.on('join_room', ({ roomId, playerName }) => {
      const name = sanitizeName(playerName);
      const room = rooms.get(roomId?.toUpperCase());

      if (!room) { socket.emit('error', { message: 'Room not found.' }); return; }
      if (room.game) { socket.emit('error', { message: 'Game already in progress.' }); return; }
      if (room.players.length >= room.maxPlayers) { socket.emit('error', { message: 'Room is full.' }); return; }

      const color = COLORS[room.players.length];
      const player = { id: socket.id, name, color, connected: true };
      room.players.push(player);

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.color = color;

      io.to(roomId).emit('player_joined', { room });
      socket.emit('room_joined', { roomId, room });

      if (room.players.length === room.maxPlayers) startGame(io, room);

      console.log(`[Room] ${name} joined ${roomId}`);
    });

    // ── Start Game (host) ──────────────────────────────────────────────────
    socket.on('start_game', () => {
      const room = getPlayerRoom(socket);
      if (!room) return;
      if (room.players[0].id !== socket.id) { socket.emit('error', { message: 'Only the host can start.' }); return; }
      if (room.players.length < 2) { socket.emit('error', { message: 'Need at least 2 players.' }); return; }
      if (!room.game) startGame(io, room);
    });

    // ── Roll Dice ──────────────────────────────────────────────────────────
    socket.on('roll_dice', () => {
      const room = getPlayerRoom(socket);
      if (!room || !room.game) return;
      const game = room.game;

      const currentPlayer = game.players.find(p => p.color === game.currentTurn);
      if (!currentPlayer || currentPlayer.id !== socket.id) {
        socket.emit('error', { message: 'Not your turn.' }); return;
      }
      if (game.diceRolled) { socket.emit('error', { message: 'Already rolled.' }); return; }

      const value = rollDice();
      game.diceValue = value;
      game.diceRolled = true;
      game.validMoves = getValidMoves(game, game.currentTurn, value);

      io.to(room.id).emit('dice_rolled', {
        color: game.currentTurn,
        dice: value,
        validMoves: game.validMoves
      });

      if (game.validMoves.length === 0) {
        // No moves: auto advance
        setTimeout(() => {
          if (!room.game) return;
          advanceTurn(io, room, false);
        }, 1500);
      } else {
        // Set timer for token selection
        clearTurnTimer(room);
        room.turnTimer = setTimeout(() => {
          if (!room.game || room.game.currentTurn !== currentPlayer.color) return;
          clearInterval(room.turnTimerInterval);
          // Auto pick first valid move
          const m = room.game.validMoves[0];
          if (m) executeMove(io, room, currentPlayer.color, m.tokenIndex);
        }, TURN_TIMEOUT_MS);

        let sel = TURN_TIMEOUT_MS / 1000;
        room.turnTimerInterval = setInterval(() => {
          sel--;
          io.to(room.id).emit('turn_timer', { seconds: sel });
        }, 1000);
      }
    });

    // ── Move Token ─────────────────────────────────────────────────────────
    socket.on('move_token', ({ tokenIndex }) => {
      const room = getPlayerRoom(socket);
      if (!room || !room.game) return;
      const game = room.game;

      const currentPlayer = game.players.find(p => p.color === game.currentTurn);
      if (!currentPlayer || currentPlayer.id !== socket.id) {
        socket.emit('error', { message: 'Not your turn.' }); return;
      }
      if (!game.diceRolled) { socket.emit('error', { message: 'Roll dice first.' }); return; }

      const validMove = game.validMoves.find(m => m.tokenIndex === tokenIndex);
      if (!validMove) { socket.emit('error', { message: 'Invalid move.' }); return; }

      clearTurnTimer(room);
      executeMove(io, room, currentPlayer.color, tokenIndex);
    });

    // ── Chat ───────────────────────────────────────────────────────────────
    socket.on('chat_message', ({ message }) => {
      const room = getPlayerRoom(socket);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;
      const msg = String(message).replace(/[<>&]/g, '').trim().slice(0, 200);
      if (!msg) return;
      const entry = { name: player.name, color: player.color, message: msg, time: Date.now() };
      room.chat.push(entry);
      if (room.chat.length > 100) room.chat.shift();
      io.to(room.id).emit('chat_message', entry);
    });

    // ── Emoji Reaction ─────────────────────────────────────────────────────
    socket.on('emoji_reaction', ({ emoji }) => {
      const room = getPlayerRoom(socket);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;
      const safe = ['👍','😂','😮','😢','🎉','🔥','💪','😡','😤','👏','💀','🏆'].includes(emoji) ? emoji : '👍';
      io.to(room.id).emit('emoji_reaction', { name: player.name, color: player.color, emoji: safe });
    });

    // ── Restart Game ───────────────────────────────────────────────────────
    socket.on('restart_game', () => {
      const room = getPlayerRoom(socket);
      if (!room) return;
      if (room.players[0].id !== socket.id) { socket.emit('error', { message: 'Only the host can restart.' }); return; }
      clearTurnTimer(room);
      room.game = null;
      io.to(room.id).emit('game_restarted', { players: room.players });
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      const room = getPlayerRoom(socket);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.connected = false;
        io.to(room.id).emit('player_disconnected', { name: player.name, color: player.color });
        if (room.game && room.game.currentTurn === player.color) {
          clearTurnTimer(room);
          advanceTurn(io, room, false);
        }
        if (room.players.every(p => !p.connected)) {
          clearTurnTimer(room);
          rooms.delete(room.id);
          console.log(`[Room] Deleted empty room ${room.id}`);
        }
      }
    });

    // ── Reconnect ─────────────────────────────────────────────────────────
    socket.on('reconnect_room', ({ roomId, playerName }) => {
      const room = rooms.get(roomId?.toUpperCase());
      if (!room) { socket.emit('error', { message: 'Room not found.' }); return; }
      const name = sanitizeName(playerName);
      const player = room.players.find(p => p.name === name && !p.connected);
      if (!player) { socket.emit('error', { message: 'Player not found in room.' }); return; }
      player.id = socket.id;
      player.connected = true;
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.color = player.color;
      socket.emit('reconnected', { color: player.color, players: room.players });
      if (room.game) socket.emit('game_state', buildClientState(room.game, room));
      io.to(roomId).emit('player_reconnected', { name, color: player.color });
    });

    // ── Get Public Rooms ──────────────────────────────────────────────────
    socket.on('get_rooms', () => {
      const publicRooms = Array.from(rooms.values())
        .filter(r => !r.game) // Only show rooms that haven't started
        .map(r => ({
          id: r.id,
          players: r.players.length,
          maxPlayers: r.maxPlayers,
          host: r.players[0]?.name || 'Unknown'
        }));
      socket.emit('rooms_list', publicRooms);
    });
  });

  // ── Internal helpers ─────────────────────────────────────────────────────

  function getPlayerRoom(socket) {
    return socket.data?.roomId ? rooms.get(socket.data.roomId) : null;
  }

  function startGame(io, room) {
    const playerData = room.players.map(p => ({ id: p.id, name: p.name, type: p.type || 'human' }));
    room.game = createGameState(playerData);
    io.to(room.id).emit('game_started', { 
      gameState: buildClientState(room.game, room), 
      playerColors: room.players.map(p => ({ socketId: p.id, color: p.color })) 
    });
    // Check if first turn is a bot
    const firstPlayer = room.game.players.find(p => p.color === room.game.currentTurn);
    if (firstPlayer && firstPlayer.type === 'bot') {
      scheduleBotTurn(io, room);
    } else {
      startTurnTimer(io, room);
    }
  }

  function executeMove(io, room, color, tokenIndex) {
    const game = room.game;
    const moveResult = applyMove(game, color, tokenIndex, game.diceValue);
    if (!moveResult) return;

    const token = game.tokens[color][tokenIndex];

    io.to(room.id).emit('token_moved', {
      color,
      tokenIndex,
      oldPosition: moveResult.oldPosition,
      newPosition: moveResult.newPosition,
      path: moveResult.path,
      captured: moveResult.captured,
      dice: game.diceValue
    });

    // Check win
    if (checkWin(game, color)) {
      const winner = game.players.find(p => p.color === color);
      game.phase = 'finished';
      io.to(room.id).emit('game_over', { winner: color, winnerName: winner?.name });
      clearTurnTimer(room);
      return;
    }

    // Advance turn
    advanceTurn(io, room, moveResult.extraTurn);
  }

  function advanceTurn(io, room, extraTurn) {
    const game = room.game;
    if (!game || game.phase === 'finished') return;

    if (extraTurn) {
      game.diceRolled = false;
      game.diceValue = null;
      game.validMoves = [];
    } else {
      const nextColor = getNextPlayer(game);
      if (!nextColor) return;
      game.currentTurn = nextColor;
      game.diceRolled = false;
      game.diceValue = null;
      game.validMoves = [];
    }

    io.to(room.id).emit('game_state', buildClientState(game, room));

    // Check if current turn is a bot
    const currentPlayer = game.players.find(p => p.color === game.currentTurn);
    if (currentPlayer && currentPlayer.type === 'bot') {
      scheduleBotTurn(io, room);
    } else {
      startTurnTimer(io, room);
    }
  }

  function startTurnTimer(io, room) {
    clearTurnTimer(room);
    if (!room.game || room.game.phase === 'finished') return;

    const game = room.game;
    let timeLeft = TURN_TIMEOUT_MS / 1000;
    io.to(room.id).emit('turn_timer', { seconds: timeLeft });

    room.turnTimerInterval = setInterval(() => {
      timeLeft--;
      io.to(room.id).emit('turn_timer', { seconds: timeLeft });
    }, 1000);

    room.turnTimer = setTimeout(() => {
      clearInterval(room.turnTimerInterval);
      if (!room.game) return;

      const currentColor = game.currentTurn;
      if (!game.diceRolled) {
        // Auto roll
        const value = rollDice();
        game.diceValue = value;
        game.diceRolled = true;
        game.validMoves = getValidMoves(game, currentColor, value);

        const currentPlayer = game.players.find(p => p.color === currentColor);
        io.to(room.id).emit('dice_rolled', {
          playerId: currentPlayer?.id,
          color: currentColor,
          value,
          movableTokens: game.validMoves.map(m => m.tokenIndex),
          auto: true,
        });

        if (game.validMoves.length === 0) {
          setTimeout(() => { if (room.game) advanceTurn(io, room, false); }, 1000);
        } else {
          setTimeout(() => {
            if (!room.game) return;
            const m = room.game.validMoves[0];
            if (m) executeMove(io, room, currentColor, m.tokenIndex);
          }, 1500);
        }
      } else {
        // Auto pick move
        const m = game.validMoves[0];
        if (m) executeMove(io, room, currentColor, m.tokenIndex);
        else advanceTurn(io, room, false);
      }
    }, TURN_TIMEOUT_MS);
  }

  function clearTurnTimer(room) {
    if (room.turnTimer)         { clearTimeout(room.turnTimer);   room.turnTimer = null; }
    if (room.turnTimerInterval) { clearInterval(room.turnTimerInterval); room.turnTimerInterval = null; }
    if (room.botTimer)          { clearTimeout(room.botTimer);    room.botTimer = null; }
  }

  /**
   * Schedule a bot's turn: auto-roll after 1s, then auto-move after 1s
   */
  function scheduleBotTurn(io, room) {
    clearTurnTimer(room);
    const game = room.game;
    if (!game || game.phase === 'finished') return;

    const botColor = game.currentTurn;
    console.log(`[Bot] Scheduling turn for ${botColor}`);

    // Step 1: Roll dice after 1 second delay
    room.botTimer = setTimeout(() => {
      if (!room.game || room.game.phase === 'finished' || room.game.currentTurn !== botColor) return;

      const value = rollDice();
      game.diceValue = value;
      game.diceRolled = true;
      game.validMoves = getValidMoves(game, botColor, value);

      io.to(room.id).emit('dice_rolled', {
        color: botColor,
        dice: value,
        validMoves: game.validMoves,
      });

      console.log(`[Bot] ${botColor} rolled ${value}, ${game.validMoves.length} valid moves`);

      if (game.validMoves.length === 0) {
        // No moves available — advance turn after short delay
        setTimeout(() => {
          if (room.game && room.game.currentTurn === botColor) {
            advanceTurn(io, room, false);
          }
        }, 1000);
        return;
      }

      // Step 2: Choose and execute move after 1 second delay
      room.botTimer = setTimeout(() => {
        if (!room.game || room.game.phase === 'finished' || room.game.currentTurn !== botColor) return;

        const chosenMove = chooseBotMove(game, botColor, game.validMoves);
        if (chosenMove) {
          executeMove(io, room, botColor, chosenMove.tokenIndex);
        } else {
          advanceTurn(io, room, false);
        }
      }, 1200);
    }, 1000);
  }

  function buildClientState(game, room) {
    const currentPlayer = game.players.find(p => p.color === game.currentTurn);
    return {
      players: game.players,
      tokens: game.tokens,
      currentTurn: game.currentTurn,
      currentPlayerId: currentPlayer?.id,
      diceValue: game.diceValue,
      diceRolled: game.diceRolled,
      validMoves: game.validMoves,
      phase: game.phase,
      rankings: game.rankings || []
    };
  }

  function generateRoomId() {
    let id;
    do {
      const digits = Math.floor(100 + Math.random() * 900);
      id = `SIVA${digits}`;
    } while (rooms.has(id));
    return id;
  }
};
