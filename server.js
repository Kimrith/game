// index.js
const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

// =====================
// CONFIG
// =====================
const PORT = process.env.PORT || 8080;
const ROUND_TIME = 10_000;
const MOVES = ["rock", "paper", "scissors"];

// =====================
// SERVER SETUP
// =====================
const server = http.createServer();

const wss = new WebSocket.Server({ server });

server.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
});

// =====================
// GAME STATE
// =====================
let waitingPlayer = null;
const games = {};

// =====================
// HELPERS
// =====================
const randomMove = () => MOVES[Math.floor(Math.random() * MOVES.length)];

function decideWinner(a, b) {
  if (a === b) return "draw";
  if (
    (a === "rock" && b === "scissors") ||
    (a === "paper" && b === "rock") ||
    (a === "scissors" && b === "paper")
  ) {
    return "player1";
  }
  return "player2";
}

function finishGame(gameId) {
  const game = games[gameId];
  if (!game) return;

  const [p1, p2] = game.players;

  // 🎲 Random move if player didn't choose
  if (!game.moves[p1.id]) game.moves[p1.id] = randomMove();
  if (!game.moves[p2.id]) game.moves[p2.id] = randomMove();

  const result = decideWinner(game.moves[p1.id], game.moves[p2.id]);

  game.players.forEach((p, i) => {
    let outcome = "draw";
    if (result === "player1") outcome = i === 0 ? "win" : "lose";
    if (result === "player2") outcome = i === 1 ? "win" : "lose";

    if (p.readyState === WebSocket.OPEN) {
      p.send(
        JSON.stringify({
          type: "result",
          payload: {
            yourMove: game.moves[p.id],
            opponentMove: game.moves[i === 0 ? p2.id : p1.id],
            outcome,
          },
        })
      );
    }
  });

  clearTimeout(game.timer);
  delete games[gameId];
}

// =====================
// WEBSOCKET LOGIC
// =====================
wss.on("connection", (ws) => {
  ws.id = uuidv4();
  console.log("🟢 Connected:", ws.id);

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    // 💬 CHAT
    if (data.type === "chat") {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "chat",
              payload: data.payload,
            })
          );
        }
      });
    }

    // 🎮 JOIN GAME
    if (data.type === "join") {
      if (waitingPlayer) {
        const gameId = uuidv4();

        games[gameId] = {
          players: [waitingPlayer, ws],
          moves: {},
          timer: setTimeout(() => finishGame(gameId), ROUND_TIME),
        };

        waitingPlayer.gameId = gameId;
        ws.gameId = gameId;

        waitingPlayer.send(
          JSON.stringify({
            type: "start",
            payload: { player: "player1", countdown: 10 },
          })
        );

        ws.send(
          JSON.stringify({
            type: "start",
            payload: { player: "player2", countdown: 10 },
          })
        );

        waitingPlayer = null;
      } else {
        waitingPlayer = ws;
        ws.send(
          JSON.stringify({
            type: "status",
            payload: "Waiting for opponent...",
          })
        );
      }
    }

    // ✊ SUBMIT MOVE
    if (data.type === "move") {
      const game = games[ws.gameId];
      if (!game) return;
      if (game.moves[ws.id]) return;

      game.moves[ws.id] = data.payload;

      // Finish early if both moved
      if (Object.keys(game.moves).length === 2) {
        finishGame(ws.gameId);
      }
    }
  });

  ws.on("close", () => {
    if (ws === waitingPlayer) waitingPlayer = null;
    console.log("🔴 Disconnected:", ws.id);
  });
});
