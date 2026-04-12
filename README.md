# 🎲 Multiplayer Ludo Game

A **real-time multiplayer Ludo game** built using modern web technologies. This project replicates the classic Ludo gameplay with accurate rules, smooth UI, and live synchronization using WebSockets.

---

## 🚀 Features

* 🔥 Real-time multiplayer gameplay (Socket.IO)
* 👥 Supports 2–4 players
* 🤖 Optional bot players (single-player / mixed mode)
* 🎲 Dice roll system with animation
* 🔄 Turn-based gameplay with extra turn on rolling 6
* 🎯 Accurate Ludo rules:

  * Start only on 6
  * Token capture (kill opponent)
  * Safe zones
  * Exact entry to home
* 🌐 Live synchronization across all players
* 💬 In-game chat system 
* 🏆 Winner detection & restart option
* 📱 Responsive UI (mobile + desktop)

---

## 🛠 Tech Stack

* **Frontend:** HTML, CSS, JavaScript
* **Backend:** Node.js, Express.js
* **Real-time Communication:** Socket.IO

---

## 📂 Project Structure

```
ludo-multiplayer/
│
├── client/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│
├── server/
│   ├── server.js
│   ├── gameLogic.js
│   ├── socketHandler.js
│
├── package.json
└── README.md
```

---

## ⚙️ Installation & Setup

### 1️⃣ Clone the repository

```bash
git clone https://github.com/your-username/ludo-multiplayer.git
cd ludo-multiplayer
```

### 2️⃣ Install dependencies

```bash
npm install
```

### 3️⃣ Run the server

```bash
node server.js
```

### 4️⃣ Open in browser

```
http://localhost:3000
```

---

## 🌐 Deployment

### Frontend

* Deploy using GitHub Pages

### Backend

* Deploy using:

  * Render
  * Railway

> ⚠️ Note: Update Socket.IO URL in frontend after deployment

---

## 🎮 How to Play

1. Create or join a room
2. Select number of players (2–4)
3. Enable bot if needed
4. Roll the dice 🎲
5. Move tokens according to rules
6. First player to reach home with all tokens wins 🏆

---

## 🤖 Bot Logic

* Automatically fills empty player slots
* Follows Ludo rules
* Basic AI:

  * Prioritizes killing opponents
  * Moves tokens closer to home
  * Uses 6 to unlock tokens

---

## 🔒 Game Logic Highlights

* Server-side validation (prevents cheating)
* Shared global path system (52 cells)
* Color-based start positions
* Real-time state synchronization

---


## 📸 Screenshots
<img width="1853" height="846" alt="image" src="https://github.com/user-attachments/assets/040abb75-e75f-4f72-9865-b4251972914f" />

<img width="1839" height="829" alt="image" src="https://github.com/user-attachments/assets/7980a279-2d8c-4812-a3aa-6001af57a157" />

<img width="1843" height="868" alt="image" src="https://github.com/user-attachments/assets/38db6b56-a295-48c3-a415-7b2fec4e23cb" />


---

## 🚀 Future Improvements

* 🎨 Enhanced UI/UX
* 📊 Leaderboard system
* 👤 Player authentication
* 🌙 Dark mode
* 🎵 Sound effects

---

## 🤝 Contributing

Contributions are welcome! Feel free to fork this repo and submit a pull request.

---

## 📜 License

This project is open-source and available under the MIT License.

---

## ⭐ Support

If you like this project, give it a ⭐ on GitHub!
