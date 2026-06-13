// ============ FIREBASE SETUP ============
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, set, onValue, update, get
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCB08QbuhiacEq6SfNSXCUyRBBfXvgciyA",
  authDomain: "xoxo-95576.firebaseapp.com",
  databaseURL: "https://xoxo-95576-default-rtdb.firebaseio.com",
  projectId: "xoxo-95576",
  storageBucket: "xoxo-95576.firebasestorage.app",
  messagingSenderId: "975156757943",
  appId: "1:975156757943:web:8bc137b8d0b73a73ee1432"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let roomId = null;
let mySymbol = null; // 'X' or 'O'
let gameActive = true;

const WIN_PATTERNS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function checkWinner(board) {
  for (const pattern of WIN_PATTERNS) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  if (board.every(cell => cell !== "")) return "draw";
  return null;
}

// ============ ROOM CREATE / JOIN ============

window.createRoom = async function () {
  roomId = generateRoomCode();
  mySymbol = "X";

  await set(ref(db, "rooms/" + roomId), {
    board: Array(9).fill(""),
    turn: "X",
    players: { X: true, O: false },
    winner: ""
  });

  startOnlineGame();
};

window.joinRoom = async function () {
  const codeInput = document.getElementById("joinCodeInput");
  const code = codeInput.value.trim().toUpperCase();
  if (!code) {
    alert("Please enter a room code");
    return;
  }

  const snap = await get(ref(db, "rooms/" + code));
  if (!snap.exists()) {
    alert("Room not found! Check the code.");
    return;
  }

  const data = snap.val();
  if (data.players && data.players.O) {
    alert("Room is full!");
    return;
  }

  roomId = code;
  mySymbol = "O";

  await update(ref(db, "rooms/" + roomId + "/players"), { O: true });
  startOnlineGame();
};

// ============ GAME RENDER / LOGIC ============

function startOnlineGame() {
  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");

  document.getElementById("roomCodeDisplay").innerText =
    "Room Code: " + roomId + "  |  You are: " + mySymbol;

  onValue(ref(db, "rooms/" + roomId), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    renderOnlineBoard(data.board, data.turn, data.winner);
  });
}

function renderOnlineBoard(board, turn, winner) {
  for (let i = 0; i < 9; i++) {
    const cell = document.getElementById(String(i));
    if (!cell) continue;

    const val = board[i];
    cell.innerText = val || "";
    cell.classList.remove("X", "O");
    if (val === "X") cell.classList.add("X");
    if (val === "O") cell.classList.add("O");
  }

  const statusEl = document.getElementById("status");

  if (winner === "draw") {
    statusEl.innerText = "It's a Draw! 🤝";
    gameActive = false;
  } else if (winner) {
    statusEl.innerText = winner === mySymbol ? "You Won! 🎉" : "You Lost! " + winner + " wins.";
    gameActive = false;
  } else if (turn === mySymbol) {
    statusEl.innerText = "Your Turn (" + mySymbol + ")";
    gameActive = true;
  } else {
    statusEl.innerText = "Waiting for opponent (" + turn + ")...";
    gameActive = true;
  }
}

// called from onclick="handleClick(this)" in HTML
window.handleClick = async function (el) {
  if (!roomId) return;
  if (!gameActive) return;

  const index = Number(el.id);

  const snap = await get(ref(db, "rooms/" + roomId));
  const data = snap.val();
  if (!data) return;

  const { board, turn, winner } = data;

  if (winner) return;
  if (turn !== mySymbol) return;
  if (board[index] !== "") return;

  const newBoard = [...board];
  newBoard[index] = mySymbol;

  const newWinner = checkWinner(newBoard);
  const nextTurn = mySymbol === "X" ? "O" : "X";

  await update(ref(db, "rooms/" + roomId), {
    board: newBoard,
    turn: nextTurn,
    winner: newWinner || ""
  });
};

// called from onclick="resetOnlineGame()" in HTML
window.resetOnlineGame = async function () {
  if (!roomId) return;
  gameActive = true;
  await update(ref(db, "rooms/" + roomId), {
    board: Array(9).fill(""),
    turn: "X",
    winner: ""
  });
};
