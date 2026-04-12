# 🎲 Ludo King — Multiplayer

A production-quality real-time multiplayer Ludo game built with Node.js, Express, Socket.IO, and Vanilla JS.

## Features

- 🎮 2–4 player real-time multiplayer
- 🔒 Server-authoritative game logic (no cheating)
- 💬 Real-time chat + emoji reactions
- ⏱️ 25-second turn timer with auto-skip
- 🎯 Full Ludo rules: captures, safe cells, home column, exact home entry
- 🏆 Rankings & winner screen
- 📱 Responsive design (mobile + desktop)

## Setup & Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Start server
npm start
# OR for development with auto-reload:
npm run dev

# 3. Open browser
# http://localhost:3000
```

## How to Play

1. Enter your name on the home screen
2. Click **Create Room** to host, or enter a code and **Join**
3. Share the 6-character room code with friends
4. Host clicks **Start Game** (min 2 players required)
5. Click **Roll Dice** on your turn, then click a highlighted token to move it

## Game Rules

- Roll a **6** to bring a token out of base
- Rolling a 6 gives you an extra turn
- Land on an opponent = capture (send them back to base)
- Capturing also gives an extra turn
- **Starred cells** are safe — no captures there
- Enter the home column and reach position 6 with an exact roll
- First to get all 4 tokens home wins!

## Deployment

### Backend (Render/Railway)
1. Push to GitHub
2. Create new Web Service on [render.com](https://render.com)
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add env var: `PORT=10000`

### Frontend
The frontend is served by the same Express server — no separate deployment needed.

## Project Structure

```
ludo-multiplayer/
├── client/
│   ├── index.html    # All screens (Home, Lobby, Game, Winner)
│   ├── style.css     # Dark theme, animations
│   └── app.js        # Board rendering, socket client
├── server/
│   ├── server.js         # Express + Socket.IO setup
│   ├── gameLogic.js      # Rules engine (authoritative)
│   └── socketHandler.js  # All real-time event handling
├── package.json
└── README.md
```
