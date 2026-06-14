// ============ FIREBASE SETUP ============
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, set, onValue, update, get, remove, onDisconnect, push
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
let mySymbol = null;      // 'X' or 'O'
let myName = null;
let clientId = null;      // Unique ID to handle turn swapping safely
let gameActive = false;
let roomListener = null;
let lastData = null;
let isChatOpen = false;
let chatLength = 0;

// Audio Recording Variables
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const INACTIVITY_MS = 1000 * 60 * 60 * 24; // 24 hours

const WIN_PATTERNS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

// ============ KEYBOARD LISTENERS ============
window.handleNameKeyPress = function(e) {
  if (e.key === 'Enter') submitName();
};

window.handleJoinKeyPress = function(e) {
  if (e.key === 'Enter') joinRoom();
};

// ============ CUSTOM MODAL ============
window.showModal = function (message, type = 'alert') {
  return new Promise((resolve) => {
    const overlay = document.getElementById("modalOverlay");
    const msgEl = document.getElementById("modalMessage");
    const okBtn = document.getElementById("modalOkBtn");
    const yesBtn = document.getElementById("modalYesBtn");
    const cancelBtn = document.getElementById("modalCancelBtn");

    msgEl.innerText = message;
    overlay.classList.remove("hidden");

    okBtn.classList.add("hidden");
    yesBtn.classList.add("hidden");
    cancelBtn.classList.add("hidden");

    const cleanup = () => {
      overlay.classList.add("hidden");
      okBtn.onclick = null;
      yesBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    if (type === 'alert') {
      okBtn.classList.remove("hidden");
      okBtn.onclick = () => { cleanup(); resolve(true); };
    } else if (type === 'confirm') {
      yesBtn.classList.remove("hidden");
      cancelBtn.classList.remove("hidden");
      yesBtn.onclick = () => { cleanup(); resolve(true); };
      cancelBtn.onclick = () => { cleanup(); resolve(false); };
    }
  });
};

// ============ SVG ASSETS ============
function heartSVG() {
  return `
  <svg class="mark-svg heart-doodle" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 86 C 18 64, 8 44, 14 30 C 18 18, 36 14, 50 30 C 64 14, 82 18, 86 30 C 92 44, 82 64, 50 86 Z"
          fill="none" stroke="#ff2d55" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 0" />
    <path d="M30 34 C 33 30, 40 30, 42 34" fill="none" stroke="#ff2d55" stroke-width="3.5" stroke-linecap="round" opacity="0.7"/>
  </svg>`;
}

function circleSVG() {
  return `
  <svg class="mark-svg circle-doodle" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M52 18 C 78 16, 90 38, 84 58 C 78 80, 50 90, 28 82 C 8 74, 8 44, 22 28 C 32 18, 44 16, 56 18"
          fill="none" stroke="#2d7dff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function avatarSVG(online) {
  const skin = "#f1c27d";
  const ring = online ? "#22c55e" : "#9ca3af";
  const hair = "#3a2a1a";
  const shirt = online ? "#3a7bd5" : "#6b7280";
  const mouth = online
    ? `<path d="M40 62 Q50 72 60 62" fill="none" stroke="#7a3b2e" stroke-width="3" stroke-linecap="round"/>`
    : `<path d="M40 66 Q50 60 60 66" fill="none" stroke="#7a3b2e" stroke-width="3" stroke-linecap="round"/>`;
  return `
  <svg class="avatar-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="48" fill="#ffffff"/>
    <circle cx="50" cy="50" r="48" fill="none" stroke="${ring}" stroke-width="5"/>
    <path d="M18 96 C20 76 34 70 50 70 C66 70 80 76 82 96 Z" fill="${shirt}"/>
    <rect x="44" y="58" width="12" height="14" rx="5" fill="${skin}"/>
    <circle cx="50" cy="44" r="22" fill="${skin}"/>
    <path d="M28 42 C26 22 74 22 72 42 C72 34 64 28 50 28 C36 28 28 34 28 42 Z" fill="${hair}"/>
    <circle cx="42" cy="44" r="3" fill="#2b2b2b"/>
    <circle cx="58" cy="44" r="3" fill="#2b2b2b"/>
    ${mouth}
  </svg>`;
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toLowerCase();
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

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }
function hideAllScreens() {
  ["namePrompt", "lobby", "waitingRoom", "game"].forEach(hide);
}

// ============ PERSISTENCE ============
function saveSession() {
  if (roomId && mySymbol && myName) {
    localStorage.setItem("xoxo_session", JSON.stringify({ roomId, mySymbol, myName }));
  }
}
function clearSession() { localStorage.removeItem("xoxo_session"); }
function loadSession() {
  try { return JSON.parse(localStorage.getItem("xoxo_session")); }
  catch { return null; }
}

// ============ NAME PROMPT ============
window.submitName = function () {
  const input = document.getElementById("playerNameInput");
  const name = input.value.trim();
  if (!name) { showModal("Please enter your name"); return; }
  myName = name;
  localStorage.setItem("xoxo_name", myName);
  document.getElementById("lobbyGreeting").innerText =
    "Hi " + myName + "! Create a new game or join your friend's room";
  hideAllScreens();
  show("lobby");
};

window.editName = function () {
  const input = document.getElementById("playerNameInput");
  input.value = myName || ""; 
  hideAllScreens();
  show("namePrompt");
};

// ============ ROOM CREATE / JOIN ============
window.createRoom = async function () {
  roomId = generateRoomCode();
  mySymbol = "X";

  await set(ref(db, "rooms/" + roomId), {
    board: Array(9).fill(""),
    turn: "X",
    players: { X: true, O: false },
    names: { X: myName, O: "" },
    clients: { X: clientId, O: "" },
    scores: { X: 0, O: 0, draws: 0 },
    online: { X: true, O: false },
    rematch: { X: false, O: false },
    started: false,
    winner: "",
    lastActivity: Date.now()
  });

  saveSession();
  enterRoom();
};

window.joinRoom = async function () {
  const codeInput = document.getElementById("joinCodeInput");
  const code = codeInput.value.trim().toLowerCase();
  if (!code) { showModal("Please enter a room code"); return; }

  const snap = await get(ref(db, "rooms/" + code));
  if (!snap.exists()) { showModal("Room not found! Check the code."); return; }

  const data = snap.val();
  if (data.players && data.players.O) { showModal("Room is full!"); return; }

  roomId = code;
  mySymbol = "O";

  await update(ref(db, "rooms/" + roomId), {
    "players/O": true,
    "names/O": myName,
    "clients/O": clientId,
    "online/O": true,
    "rematch/O": false,
    lastActivity: Date.now()
  });

  saveSession();
  enterRoom();
};

// ============ ENTER / LISTEN ============
function enterRoom() {
  hideAllScreens();
  chatLength = 0;
  isChatOpen = false;
  document.getElementById("chatPanel").classList.add("closed");
  show("chatFab");

  const onlineRef = ref(db, "rooms/" + roomId + "/online/" + mySymbol);
  set(onlineRef, true);
  onDisconnect(onlineRef).set(false);

  if (roomListener) roomListener();

  roomListener = onValue(ref(db, "rooms/" + roomId), (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      showModal("This room no longer exists.").then(() => goToLobby());
      return;
    }
    lastData = data;

    // Client Swap Logic
    if (data.clients && data.clients[mySymbol] !== clientId) {
      const otherSymbol = mySymbol === "X" ? "O" : "X";
      if (data.clients[otherSymbol] === clientId) {
        const oldRef = ref(db, "rooms/" + roomId + "/online/" + mySymbol);
        onDisconnect(oldRef).cancel();
        
        mySymbol = otherSymbol;
        saveSession();
        
        const newRef = ref(db, "rooms/" + roomId + "/online/" + mySymbol);
        set(newRef, true);
        onDisconnect(newRef).set(false);
      }
    }

    // Chat Updates
    if (data.chats) {
      renderChats(data.chats);
    } else {
      document.getElementById("chatMessages").innerHTML = "";
      chatLength = 0;
    }

    if (data.lastActivity && (Date.now() - data.lastActivity > INACTIVITY_MS)) {
      remove(ref(db, "rooms/" + roomId));
      return;
    }

    if (!data.started) {
      showWaitingRoom(data);
    } else {
      showGame(data);
    }
  });
}

// ============ CHAT & AUDIO SYSTEM ============
window.toggleChat = function() {
  const panel = document.getElementById("chatPanel");
  isChatOpen = !isChatOpen;
  
  if (isChatOpen) {
    panel.classList.remove("closed");
    document.getElementById("chatBadge").classList.add("hidden");
    scrollToChatBottom();
  } else {
    panel.classList.add("closed");
  }
};

window.sendChatMessage = async function(textOverride = null) {
  const input = document.getElementById("chatInput");
  const text = textOverride || input.value.trim();
  if (!text || !roomId || !mySymbol) return;

  if(!textOverride) input.value = "";
  
  const chatRef = ref(db, `rooms/${roomId}/chats`);
  await push(chatRef, {
    sender: mySymbol,
    text: text,
    timestamp: Date.now()
  });
  await update(ref(db, "rooms/" + roomId), { lastActivity: Date.now() });
};

window.handleChatKeyPress = function(e) {
  if (e.key === 'Enter') sendChatMessage();
};

// AUDIO RECORDING LOGIC
window.toggleRecording = async function() {
  const micBtn = document.getElementById("micBtn");
  
  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          sendChatMessage(base64Audio); // Send the audio string as a message
        };
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      micBtn.classList.add("recording");
      
    } catch (err) {
      showModal("Microphone access denied or not available.");
    }
  } else {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    isRecording = false;
    micBtn.classList.remove("recording");
  }
};

function renderChats(chatsObj) {
  const chatBox = document.getElementById("chatMessages");
  const chatValues = Object.values(chatsObj);

  if (chatValues.length > chatLength && !isChatOpen) {
    document.getElementById("chatBadge").classList.remove("hidden");
  }
  chatLength = chatValues.length;

  chatBox.innerHTML = chatValues.map(c => {
    const isMe = c.sender === mySymbol;
    
    // Check if the message is a Base64 Audio string
    let messageContent = "";
    if (c.text.startsWith("data:audio/")) {
      messageContent = `<audio controls src="${c.text}" class="chat-audio"></audio>`;
    } else {
      messageContent = `<span class="msg-text">${escapeHtml(c.text)}</span>`;
    }

    return `<div class="chat-msg ${isMe ? 'msg-me' : 'msg-them'}">${messageContent}</div>`;
  }).join("");

  if (isChatOpen) scrollToChatBottom();
}

function scrollToChatBottom() {
  const chatBox = document.getElementById("chatMessages");
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ============ PLAYER STATUS BAR & SCOREBOARD ============
function buildPlayerCard(symbol, data) {
  const name = (data.names && data.names[symbol]) || (symbol === "X" ? "Player X" : "Player O");
  const online = !!(data.online && data.online[symbol]);
  const score = data.scores ? data.scores[symbol] : 0;
  const mark = symbol === "X" ? heartSVG() : circleSVG();
  const youTag = symbol === mySymbol ? " (You)" : "";
  
  return `
    <div class="player-card ${online ? "is-online" : "is-offline"}">
      <div class="avatar-wrap">
        ${avatarSVG(online)}
        <span class="status-dot ${online ? "dot-online" : "dot-offline"}"></span>
      </div>
      <div class="player-meta">
        <div class="player-name">${escapeHtml(name)}${youTag}</div>
        <div class="player-score">Score: <span>${score}</span></div>
        <div class="player-mark">${mark}<span>${online ? "Online" : "Offline"}</span></div>
      </div>
    </div>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderStatusBar(elId, data) {
  const draws = data.scores ? data.scores.draws : 0;
  document.getElementById(elId).innerHTML =
    buildPlayerCard("X", data) +
    `<div class="vs-label">VS<br><span class="draws-text">${draws} Draws</span></div>` +
    buildPlayerCard("O", data);
}

// ============ WAITING ROOM ============
function showWaitingRoom(data) {
  hideAllScreens();
  show("waitingRoom");

  document.getElementById("waitRoomCode").innerText =
    "Room Code: " + roomId + "  |  You are: " + mySymbol;

  renderStatusBar("waitPlayers", data);

  if (data.players?.X && data.players?.O && !data.started) {
    update(ref(db, "rooms/" + roomId), {
      started: true,
      lastActivity: Date.now()
    });
  }
}

// ============ GAME ============
function showGame(data) {
  hideAllScreens();
  show("game");

  document.getElementById("roomCodeDisplay").innerText =
    "Room Code: " + roomId;

  renderStatusBar("playersBar", data);
  renderOnlineBoard(data.board, data.turn, data.winner, data.names);
  renderRematch(data);
}

function renderOnlineBoard(board, turn, winner, names) {
  for (let i = 0; i < 9; i++) {
    const cell = document.getElementById(String(i));
    if (!cell) continue;

    const val = board[i];
    cell.classList.remove("X", "O");
    if (val === "X") {
      cell.innerHTML = heartSVG();
      cell.classList.add("X");
    } else if (val === "O") {
      cell.innerHTML = circleSVG();
      cell.classList.add("O");
    } else {
      cell.innerHTML = "";
    }
  }

  const statusEl = document.getElementById("status");
  const nameOf = (sym) => (names?.[sym]) || ("Player " + sym);

  if (winner === "draw") {
    statusEl.innerText = "It's a Draw! 🤝";
    gameActive = false;
  } else if (winner) {
    if (winner === mySymbol) {
      statusEl.innerText = "🎉 You (" + nameOf(winner) + ") Won!";
    } else {
      statusEl.innerText = nameOf(winner) + " Won! 🏆";
    }
    gameActive = false;
  } else if (turn === mySymbol) {
    statusEl.innerText = "Your Turn, " + nameOf(mySymbol);
    gameActive = true;
  } else {
    statusEl.innerText = "Waiting for " + nameOf(turn) + "...";
    gameActive = true;
  }
}

// ============ REMATCH FLOW ============
function renderRematch(data) {
  const info = document.getElementById("rematchInfo");
  const btn = document.getElementById("rematchBtn");
  const r = data.rematch || { X: false, O: false };
  const gameOver = !!data.winner;

  btn.disabled = !gameOver;
  btn.style.opacity = gameOver ? "1" : "0.5";
  btn.style.cursor = gameOver ? "pointer" : "not-allowed";

  if (!gameOver) {
    info.innerText = "";
    btn.innerText = "New Game";
    return;
  }

  const mine = r[mySymbol];
  const opp = mySymbol === "X" ? r.O : r.X;
  const oppName = (data.names && (mySymbol === "X" ? data.names.O : data.names.X)) || "Opponent";

  if (mine && opp) {
    info.innerText = "Both agreed! Starting new game...";
  } else if (mine && !opp) {
    info.innerText = "Waiting for " + oppName + " to accept rematch...";
    btn.innerText = "Cancel Rematch";
  } else if (!mine && opp) {
    info.innerText = oppName + " wants a rematch! Click New Game to accept.";
    btn.innerText = "Accept Rematch";
  } else {
    info.innerText = "Game over. Want to play again?";
    btn.innerText = "New Game";
  }

  if (mine && opp && mySymbol === "X") {
    const s = data.scores || { X: 0, O: 0, draws: 0 };
    update(ref(db, "rooms/" + roomId), {
      board: Array(9).fill(""),
      turn: "X", 
      winner: "",
      rematch: { X: false, O: false },
      names: { X: data.names.O, O: data.names.X },         
      clients: { X: data.clients.O, O: data.clients.X },   
      scores: { X: s.O, O: s.X, draws: s.draws },          
      lastActivity: Date.now()
    });
  }
}

window.requestRematch = async function () {
  if (!roomId || !lastData) return;
  if (!lastData.winner) return;

  const current = !!(lastData.rematch && lastData.rematch[mySymbol]);
  await update(ref(db, "rooms/" + roomId + "/rematch"), {
    [mySymbol]: !current
  });
  await update(ref(db, "rooms/" + roomId), { lastActivity: Date.now() });
};

// ============ GAME MOVE ============
window.handleClick = async function (el) {
  if (!roomId || !gameActive) return;

  const index = Number(el.id);

  const snap = await get(ref(db, "rooms/" + roomId));
  const data = snap.val();
  if (!data || !data.started) return;

  const { board, turn, winner } = data;
  if (winner) return;
  if (turn !== mySymbol) return;
  if (board[index] !== "") return;

  const newBoard = [...board];
  newBoard[index] = mySymbol;

  const newWinner = checkWinner(newBoard);
  const nextTurn = mySymbol === "X" ? "O" : "X";

  let updates = {
    board: newBoard,
    turn: nextTurn,
    winner: newWinner || "",
    lastActivity: Date.now()
  };

  if (newWinner) {
    const s = data.scores || { X: 0, O: 0, draws: 0 };
    if (newWinner === "draw") s.draws++;
    else if (newWinner === "X") s.X++;
    else if (newWinner === "O") s.O++;
    updates.scores = s;
  }

  await update(ref(db, "rooms/" + roomId), updates);
};

// ============ LEAVE ============
window.leaveRoom = async function () {
  if (!roomId) { goToLobby(); return; }
  const confirmLeave = await showModal("Leave this room? The room will be closed for both players.", "confirm");
  if (!confirmLeave) return;
  await remove(ref(db, "rooms/" + roomId));
  goToLobby();
};

function goToLobby() {
  if (roomListener) { roomListener(); roomListener = null; }
  clearSession();
  roomId = null;
  mySymbol = null;
  gameActive = false;
  lastData = null;
  isChatOpen = false;
  chatLength = 0;
  
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
  }
  isRecording = false;
  
  const panel = document.getElementById("chatPanel");
  if (panel) panel.classList.add("closed");
  
  hide("chatFab");
  
  hideAllScreens();
  show("lobby");
}

// ============ INITIALIZATION ============
async function init() {
  clientId = localStorage.getItem("xoxo_clientId");
  if (!clientId) {
    clientId = Math.random().toString(36).substring(2, 9);
    localStorage.setItem("xoxo_clientId", clientId);
  }

  const savedName = localStorage.getItem("xoxo_name");
  if (savedName) {
    myName = savedName;
    document.getElementById("lobbyGreeting").innerText =
      "Hi " + myName + "! Create a new game or join your friend's room";
  }

  const session = loadSession();
  if (session && session.roomId && session.mySymbol && session.myName) {
    const snap = await get(ref(db, "rooms/" + session.roomId));
    if (snap.exists()) {
      const data = snap.val();
      const slotName = data.names?.[session.mySymbol];
      if (data.players?.[session.mySymbol] && slotName === session.myName) {
        roomId = session.roomId;
        mySymbol = session.mySymbol;
        myName = session.myName;
        enterRoom();
        return;
      }
    }
    clearSession();
  }

  hideAllScreens();
  if (myName) show("lobby");
  else show("namePrompt");
}

init();