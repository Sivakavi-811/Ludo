/**
 * LUDO GAME LOGIC - Server-side authoritative game state
 * Handles all rule validation, token movement, captures, and win detection
 */

const COLORS = ['red', 'blue', 'green', 'yellow'];

// Safe cells on the main track (0-indexed, 0 = red start, 13=blue start, 26=green start, 39=yellow start)
const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Each color's starting position on main track
const COLOR_START = { red: 0, green: 13, yellow: 26, blue: 39 };

// Each color's entry to home column (last cell before home stretch)
const COLOR_HOME_ENTRY = { red: 50, green: 11, yellow: 24, blue: 37 };

// Home column length (5 steps to the very final goal)
const HOME_COL_LENGTH = 5;

// Total main track cells
const TRACK_SIZE = 52;

/**
 * Generate initial token positions for all 4 colors
 * Positions: -1 = in base, 0-51 = main track, 100-105 = home column (100=first, 105=home)
 */
function createInitialTokens() {
  const tokens = {};
  COLORS.forEach(color => {
    tokens[color] = [
      { id: 0, position: -1, color },
      { id: 1, position: -1, color },
      { id: 2, position: -1, color },
      { id: 3, position: -1, color }
    ];
  });
  return tokens;
}

/**
 * Get absolute track position for a token given its color
 * Returns null if token is in base or home
 */
function getAbsolutePosition(color, relativePos) {
  if (relativePos < 0 || relativePos >= 200) return null;
  return (COLOR_START[color] + relativePos) % TRACK_SIZE;
}

/**
 * Convert absolute track position to relative for a color
 */
function getRelativePosition(color, absolutePos) {
  return (absolutePos - COLOR_START[color] + TRACK_SIZE) % TRACK_SIZE;
}

/**
 * Check if a token can move with given dice value
 * Returns { canMove, newPosition, enterHome }
 */
function canTokenMove(token, dice, color) {
  const pos = token.position;

  // Token in base: needs 6 to come out
  if (pos === -1) {
    return { canMove: dice === 6, newPosition: COLOR_START[color], enterHome: false, unlockOnly: true };
  }

  // Token already in home
  if (pos === 200) return { canMove: false };

  // Token in home column (positions 100-105)
  if (pos >= 100 && pos < 200) {
    const homeStep = pos - 100;
    const newStep = homeStep + dice;
    if (newStep === HOME_COL_LENGTH) {
      return { canMove: true, newPosition: 200, enterHome: true }; // Reached home exactly
    } else if (newStep < HOME_COL_LENGTH) {
      return { canMove: true, newPosition: 100 + newStep, enterHome: false };
    } else {
      return { canMove: false }; // Overshoots home
    }
  }

  // Token on main track
  const relPos = getRelativePosition(color, pos);
  const newRel = relPos + dice;

  // Check if entering home column
  if (relPos <= 50 && newRel > 50) {
    const homeSteps = newRel - 50;
    if (homeSteps === HOME_COL_LENGTH + 1) {
      return { canMove: true, newPosition: 200, enterHome: true };
    } else if (homeSteps <= HOME_COL_LENGTH) {
      return { canMove: true, newPosition: 100 + homeSteps - 1, enterHome: false };
    } else {
      return { canMove: false }; // Overshoots
    }
  }

  // Normal move on track
  const newAbsolute = (pos + dice) % TRACK_SIZE;
  return { canMove: true, newPosition: newAbsolute, enterHome: false };
}

/**
 * Get all valid moves for current player
 */
function getValidMoves(gameState, color, dice) {
  const tokens = gameState.tokens[color];
  const validMoves = [];

  tokens.forEach((token, idx) => {
    const result = canTokenMove(token, dice, color);
    if (result.canMove) {
      validMoves.push({ tokenIndex: idx, ...result });
    }
  });

  return validMoves;
}

/**
 * Check for captures: if new position is on main track and occupied by opponent(s)
 * Returns array of captured tokens
 */
function checkCaptures(gameState, movingColor, newPosition) {
  if (newPosition < 0 || newPosition >= 100) return []; // Base or home column, no captures
  if (SAFE_CELLS.has(newPosition)) return []; // Safe cell

  const captured = [];
  COLORS.forEach(color => {
    if (color === movingColor) return;
    gameState.tokens[color].forEach((token, idx) => {
      if (token.position === newPosition) {
        captured.push({ color, tokenIndex: idx });
      }
    });
  });
  return captured;
}

function calculatePath(token, dice, color) {
  const path = [];
  let currentPos = token.position;

  if (currentPos === -1) {
    // Coming out of base
    path.push(COLOR_START[color]);
    return path;
  }

  for (let i = 1; i <= dice; i++) {
    const result = canTokenMove({ position: currentPos }, 1, color);
    if (result.canMove) {
      currentPos = result.newPosition;
      path.push(currentPos);
    } else {
      break;
    }
  }
  return path;
}

/**
 * Apply a move to game state (mutates state)
 * Returns { captured, reachedHome, extraTurn, path }
 */
function applyMove(gameState, color, tokenIndex, dice) {
  const token = gameState.tokens[color][tokenIndex];
  const oldPosition = token.position;
  
  const path = calculatePath(token, dice, color);
  const finalPos = path[path.length - 1];

  if (!finalPos && finalPos !== 0) return null;

  token.position = finalPos;

  // Check captures (only on main track)
  const captured = checkCaptures(gameState, color, finalPos);
  captured.forEach(({ color: capColor, tokenIndex: capIdx }) => {
    gameState.tokens[capColor][capIdx].position = -1; // Send back to base
  });

  const reachedHome = finalPos === 200;
  const extraTurn = dice === 6 || captured.length > 0;

  return { captured, reachedHome, extraTurn, oldPosition, newPosition: finalPos, path };
}

/**
 * Check if a player has won (all tokens at position 200)
 */
function checkWin(gameState, color) {
  return gameState.tokens[color].every(t => t.position === 200);
}

/**
 * Get next player in turn order (skip disconnected/finished players)
 */
function getNextPlayer(gameState) {
  const activePlayers = gameState.players.filter(p => p.active && !p.finished);
  if (activePlayers.length === 0) return null;

  const currentIdx = activePlayers.findIndex(p => p.color === gameState.currentTurn);
  const nextIdx = (currentIdx + 1) % activePlayers.length;
  return activePlayers[nextIdx].color;
}

/**
 * Create a fresh game state for given players
 */
function createGameState(players) {
  // Assign colors to players
  const assignedPlayers = players.map((p, i) => ({
    ...p,
    color: COLORS[i],
    type: p.type || 'human',
    active: true,
    finished: false,
    rank: null
  }));

  return {
    players: assignedPlayers,
    tokens: createInitialTokens(),
    currentTurn: assignedPlayers[0].color,
    phase: 'playing', // 'playing' | 'finished'
    diceValue: null,
    diceRolled: false,
    validMoves: [],
    rankings: [],
    moveCount: 0,
    startTime: Date.now()
  };
}

/**
 * Roll dice - returns 1-6
 */
function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Bot AI: choose the best move from valid moves
 * Priority: 1) Capture  2) Reach home (200)  3) Bring token out on 6
 *           4) Move token closest to home  5) First available
 */
function chooseBotMove(gameState, color, validMoves) {
  if (validMoves.length === 0) return null;
  if (validMoves.length === 1) return validMoves[0];

  // Priority 1: Can we capture an opponent?
  for (const move of validMoves) {
    if (move.newPosition >= 0 && move.newPosition < 100 && !SAFE_CELLS.has(move.newPosition)) {
      // Check if any opponent sits on this cell
      for (const oppColor of COLORS) {
        if (oppColor === color) continue;
        for (const oppToken of gameState.tokens[oppColor]) {
          if (oppToken.position === move.newPosition) {
            console.log(`[Bot AI] ${color}: Capturing ${oppColor} at ${move.newPosition}`);
            return move;
          }
        }
      }
    }
  }

  // Priority 2: Can we reach home exactly (position 200)?
  const homeMove = validMoves.find(m => m.newPosition === 200);
  if (homeMove) {
    console.log(`[Bot AI] ${color}: Reaching home!`);
    return homeMove;
  }

  // Priority 3: Bring a token out of base (unlockOnly moves)
  const unlockMove = validMoves.find(m => m.unlockOnly);
  if (unlockMove) {
    console.log(`[Bot AI] ${color}: Bringing token out of base`);
    return unlockMove;
  }

  // Priority 4: Advance the token that is closest to home
  let bestMove = validMoves[0];
  let bestProgress = -1;
  for (const move of validMoves) {
    const token = gameState.tokens[color][move.tokenIndex];
    const pos = token.position;
    let progress = 0;
    if (pos >= 100 && pos < 200) {
      progress = 50 + (pos - 100); // Already in home column
    } else if (pos >= 0) {
      const relPos = (pos - COLOR_START[color] + TRACK_SIZE) % TRACK_SIZE;
      progress = relPos;
    }
    if (progress > bestProgress) {
      bestProgress = progress;
      bestMove = move;
    }
  }
  console.log(`[Bot AI] ${color}: Moving token ${bestMove.tokenIndex} (progress=${bestProgress})`);
  return bestMove;
}

module.exports = {
  createGameState,
  rollDice,
  getValidMoves,
  applyMove,
  checkWin,
  getNextPlayer,
  chooseBotMove,
  COLORS,
  COLOR_START,
  SAFE_CELLS,
  TRACK_SIZE
};
