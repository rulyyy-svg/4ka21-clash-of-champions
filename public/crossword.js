import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { crosswordLayouts } from "./crossword_layouts.js?v=2.6";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCMb3Y1jqb4rA0ANlKL42ag9E7L1yIMZ0U",
    authDomain: "lingo-arena.firebaseapp.com",
    projectId: "lingo-arena",
    storageBucket: "lingo-arena.firebasestorage.app",
    messagingSenderId: "1089485812429",
    appId: "1:1089485812429:web:9404f51c240fc07ea66f84",
    measurementId: "G-LRH5YNGKSQ"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app, "https://lingo-arena-default-rtdb.asia-southeast1.firebasedatabase.app");
const auth = getAuth(app);

let myId = "";
let myUsername = "";
let myAvatar = "🦁";
let myTitle = "KA Novice";
let currentRoomId = "";
let isHost = false;
let roomData = null;
let statsRecorded = false;

let myLayout = null;
let secondsElapsed = 0;
let timerInterval = null;
let focusRow = 0;
let focusCol = 0;
let focusDirection = "across"; // "across" or "down"

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// 🔐 MONITOR STATUS AUTHENTIKASI & INITIALIZE
onAuthStateChanged(auth, (user) => {
    if (user) {
        updateSoundButtonUI();
        myId = user.uid;
        myUsername = user.displayName || "Guest_" + user.uid.substring(0, 4);
        
        onValue(ref(db, `users/${myId}`), (snap) => {
            const data = snap.val() || {};
            myAvatar = data.avatar || "🦁";
            myTitle = data.title || "KA Novice";
            
            const navAvatar = document.getElementById('navAvatar');
            const navUsername = document.getElementById('navUsername');
            if (navAvatar) navAvatar.innerText = myAvatar;
            if (navUsername) navUsername.innerText = myUsername;
        }, { onlyOnce: true });

        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('roomId');

        if (!currentRoomId) {
            alert("Room ID not found!");
            window.location.href = "index.html";
            return;
        }

        const roomTitle = document.getElementById('roomTitle');
        if (roomTitle) roomTitle.innerText = `ROOM: ${currentRoomId}`;
        listenToRoom();
    } else {
        window.location.href = "index.html";
    }
});

// 🕹️ LOGIKA MONITOR REALTIME ROOM
function listenToRoom() {
    onValue(ref(db, 'rooms/' + currentRoomId), (snapshot) => {
        roomData = snapshot.val();
        if (!roomData) {
            alert("Room has been deleted!");
            window.location.href = "index.html";
            return;
        }

        isHost = (roomData.hostId === myId);

        const playersArr = Object.values(roomData.players || {}).sort((a,b) => a.id.localeCompare(b.id));
        
        // 1. Assign layout based on deterministic index
        const myIndex = playersArr.findIndex(p => p.id === myId);
        const layoutIndex = myIndex !== -1 ? (myIndex % crosswordLayouts.length) : 0;
        myLayout = crosswordLayouts[layoutIndex];

        // Revert page background to match other pages
        const bgDiv = document.getElementById('gameBackground');
        if (bgDiv) {
            bgDiv.style.backgroundImage = "url('clash_arena_bg.png')";
            bgDiv.style.opacity = '0.3';
        }

        // Load layout background image dynamically on the crossword grid container
        const gridContainer = document.getElementById('crosswordGrid');
        if (gridContainer && myLayout && myLayout.background) {
            gridContainer.style.backgroundImage = `url('assets/papan teka teki silang/${encodeURIComponent(myLayout.background)}')`;
            gridContainer.style.backgroundSize = '100% 100%';
            gridContainer.style.backgroundPosition = 'center';
            gridContainer.style.backgroundRepeat = 'no-repeat';
        }

        // 2. Render Board Layout (Only first time or on layout switch)
        const layoutTitle = document.getElementById('layoutTitle');
        if (layoutTitle) layoutTitle.innerText = `LAYOUT: ${myLayout.title}`;
        
        // Initialize layout board grid in DOM if empty
        if (gridContainer && gridContainer.children.length === 0) {
            buildCrosswordGrid();
            renderClues();
        }

        // 3. Update Solvers Real-Time Progress
        updateSolversProgress(playersArr);

        // 4. Host Admin Control Panel
        const startBtn = document.getElementById('startBtn');
        const hostControlPanel = document.getElementById('hostControlPanel');
        const hostStatus = document.getElementById('hostStatus');
        
        if (isHost && !roomData.isPlaying) {
            if (hostControlPanel) hostControlPanel.classList.remove('hidden');
            if (startBtn) startBtn.classList.remove('hidden');
            if (hostStatus) hostStatus.innerText = "You are the host. Click start when everyone is ready!";
        } else if (isHost && roomData.isPlaying) {
            if (hostControlPanel) hostControlPanel.classList.remove('hidden');
            if (startBtn) startBtn.classList.add('hidden');
            if (hostStatus) hostStatus.innerText = "Game is running...";
        } else {
            if (hostControlPanel) hostControlPanel.classList.add('hidden');
        }

        // 5. Game flow status messages
        if (roomData.isPlaying) {
            startTimer();
            startTenseBackgroundMusic();
            
            // Check if all players completed
            const allFinished = playersArr.every(p => p.hasFinished === true);
            if (isHost && roomData.statusMessage !== "GAME_OVER" && allFinished) {
                update(ref(db, 'rooms/' + currentRoomId), {
                    statusMessage: "GAME_OVER"
                });
            }
        } else {
            stopTimer();
            stopTenseBackgroundMusic();
        }

        // 6. Game Over Transition
        if (roomData.statusMessage === "GAME_OVER") {
            renderGameOver(playersArr);
        }
    });
}

// 📐 BUILD CROSSWORD GRID DOM ELEMENTS
function buildCrosswordGrid() {
    const gridContainer = document.getElementById('crosswordGrid');
    if (!gridContainer || !myLayout) return;

    gridContainer.innerHTML = "";
    
    // Set grid columns dynamically
    const numRows = myLayout.grid.length;
    const numCols = myLayout.grid[0].length;
    gridContainer.style.gridTemplateColumns = `repeat(${numCols}, minmax(0, 1fr))`;

    // Create clue start markers map
    const startMarkers = {};
    myLayout.clues.across.forEach(c => {
        startMarkers[`${c.row}_${c.col}`] = c.num;
    });
    myLayout.clues.down.forEach(c => {
        startMarkers[`${c.row}_${c.col}`] = c.num;
    });

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const letter = myLayout.grid[r][c];
            const cellDiv = document.createElement('div');
            cellDiv.className = "aspect-square relative rounded-lg border border-slate-800 flex items-center justify-center";
            
            if (letter === null) {
                cellDiv.classList.add('blocked-cell');
            } else {
                cellDiv.className += " bg-slate-950/75 backdrop-blur-[2px]";
                
                // Input letter input
                const input = document.createElement('input');
                input.type = "text";
                input.maxLength = 1;
                input.id = `cell-${r}-${c}`;
                input.className = "w-full h-full text-center bg-transparent text-white font-extrabold text-base uppercase focus:outline-none input-cell transition rounded-lg";
                
                // Add absolute index marker inside cell if word starts there
                const markerNum = startMarkers[`${r}_${c}`];
                if (markerNum) {
                    const marker = document.createElement('span');
                    marker.className = "absolute top-0.5 left-1 text-[8px] font-black text-amber-500/80 leading-none select-none";
                    marker.innerText = markerNum;
                    cellDiv.appendChild(marker);
                }

                // Grid Event Listeners
                input.addEventListener('focus', () => {
                    focusRow = r;
                    focusCol = c;
                    highlightActiveWord(r, c);
                });
                
                input.addEventListener('keydown', (e) => {
                    handleGridNavigation(e, r, c);
                });

                input.addEventListener('input', (e) => {
                    handleGridInput(e, r, c);
                });

                cellDiv.appendChild(input);
            }

            gridContainer.appendChild(cellDiv);
        }
    }
}

// 🖊️ HIGHLIGHT CELLS OF THE ACTIVE SELECTED WORD
function highlightActiveWord(row, col) {
    // Clear previous highlights
    document.querySelectorAll('#crosswordGrid input').forEach(inp => {
        inp.parentElement.classList.remove('cell-highlight-word');
    });

    if (!myLayout) return;

    const numRows = myLayout.grid.length;
    const numCols = myLayout.grid[0].length;

    // Find if focused cell belongs to across/down clues
    // Simply highlight row or column based on active focusDirection
    if (focusDirection === "across") {
        for (let c = 0; c < numCols; c++) {
            const inp = document.getElementById(`cell-${row}-${c}`);
            if (inp) inp.parentElement.classList.add('cell-highlight-word');
        }
    } else {
        for (let r = 0; r < numRows; r++) {
            const inp = document.getElementById(`cell-${r}-${col}`);
            if (inp) inp.parentElement.classList.add('cell-highlight-word');
        }
    }
}

// ⌨️ INPUT FOCUS ADVANCE & SHIFT
function handleGridInput(e, r, c) {
    const val = e.target.value.trim().toUpperCase();
    e.target.value = val;

    if (val.length === 1) {
        // Move to next cell in active direction
        if (focusDirection === "across") {
            focusNextCell(r, c + 1);
        } else {
            focusNextCell(r + 1, c);
        }
    }
}

function focusNextCell(row, col) {
    const numRows = myLayout.grid.length;
    const numCols = myLayout.grid[0].length;
    if (row >= 0 && row < numRows && col >= 0 && col < numCols) {
        const nextInput = document.getElementById(`cell-${row}-${col}`);
        if (nextInput) {
            nextInput.focus();
        }
    }
}

// ⌨️ ARROW KEYS & BACKSPACE NAVIGATION
function handleGridNavigation(e, r, c) {
    if (e.key === "Backspace" && e.target.value.length === 0) {
        // Backspace on empty: focus backward
        if (focusDirection === "across") {
            focusNextCell(r, c - 1);
        } else {
            focusNextCell(r - 1, c);
        }
    } else if (e.key === "ArrowRight") {
        focusDirection = "across";
        focusNextCell(r, c + 1);
    } else if (e.key === "ArrowLeft") {
        focusDirection = "across";
        focusNextCell(r, c - 1);
    } else if (e.key === "ArrowDown") {
        focusDirection = "down";
        focusNextCell(r + 1, c);
    } else if (e.key === "ArrowUp") {
        focusDirection = "down";
        focusNextCell(r - 1, c);
    } else if (e.key === "Enter") {
        submitCrosswordPuzzle();
    }
}

// 📖 RENDER ACROSS & DOWN CLUES LISTS
function renderClues() {
    const acrossList = document.getElementById('acrossCluesList');
    const downList = document.getElementById('downCluesList');
    if (!acrossList || !downList || !myLayout) return;

    acrossList.innerHTML = myLayout.clues.across.map(c => `
        <button onclick="clickClue(${c.row}, ${c.col}, 'across')" class="w-full text-left p-1.5 rounded-lg hover:bg-slate-800/40 text-[11px] font-bold text-slate-300 transition flex items-start gap-1">
            <span class="text-amber-500 font-extrabold">${c.num}.</span>
            <span class="flex-1">${escapeHTML(c.question)}</span>
        </button>
    `).join('');

    downList.innerHTML = myLayout.clues.down.map(c => `
        <button onclick="clickClue(${c.row}, ${c.col}, 'down')" class="w-full text-left p-1.5 rounded-lg hover:bg-slate-800/40 text-[11px] font-bold text-slate-300 transition flex items-start gap-1">
            <span class="text-indigo-400 font-extrabold">${c.num}.</span>
            <span class="flex-1">${escapeHTML(c.question)}</span>
        </button>
    `).join('');
}

window.clickClue = function(row, col, dir) {
    focusDirection = dir;
    const input = document.getElementById(`cell-${row}-${col}`);
    if (input) {
        input.focus();
        highlightActiveWord(row, col);
    }
};

// 🎯 SUBMIT & VALIDATE PUZZLE SOLUTION
window.submitCrosswordPuzzle = function() {
    if (!myLayout || (roomData && roomData.players[myId].hasFinished)) return;

    const numRows = myLayout.grid.length;
    const numCols = myLayout.grid[0].length;

    let allCorrect = true;
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const correctLetter = myLayout.grid[r][c];
            if (correctLetter !== null) {
                const input = document.getElementById(`cell-${r}-${c}`);
                const userVal = input ? input.value.trim().toUpperCase() : "";
                if (userVal !== correctLetter) {
                    allCorrect = false;
                    break;
                }
            }
        }
    }

    const card = document.getElementById('crosswordCard');
    
    if (!allCorrect) {
        playGameSound('incorrect');
        if (card) {
            card.classList.remove('shake-anim', 'flash-red-border');
            void card.offsetWidth; // force reflow
            card.classList.add('shake-anim', 'flash-red-border');
        }
        alert("Ada beberapa huruf yang masih salah atau belum terisi. Coba periksa kembali! ❌");
        return;
    }

    // Correct Solution!
    playGameSound('correct');
    if (card) {
        card.classList.remove('shake-anim', 'flash-red-border');
        void card.offsetWidth;
        card.classList.add('flash-green-border');
    }

    // Disable inputs
    document.querySelectorAll('#crosswordGrid input').forEach(inp => inp.disabled = true);

    // Calculate score points (base 500 points + time bonus up to 500)
    // Faster completion = higher score
    const speedBonus = Math.max(0, 500 - secondsElapsed * 3);
    const totalScore = Math.floor(500 + speedBonus);

    // Save to Firebase
    update(ref(db, `rooms/${currentRoomId}/players/${myId}`), {
        hasFinished: true,
        completionTime: secondsElapsed,
        score: totalScore
    });

    showWaitingOverlay();
};

// ⏳ SHOW WAITING PAGE OVERLAY
function showWaitingOverlay() {
    if (document.getElementById('waitingOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = "waitingOverlay";
    overlay.className = "absolute inset-0 bg-slate-950/90 z-20 flex flex-col justify-center items-center rounded-3xl border border-slate-800/80 p-6 text-center backdrop-blur-sm";
    overlay.innerHTML = `
        <div class="space-y-4">
            <span class="text-4xl animate-bounce block">⏳</span>
            <h3 class="text-lg font-black text-amber-500">LAYOUT COMPLETED CORRECTLY!</h3>
            <p class="text-xs text-slate-400 max-w-xs font-semibold">
                You finished in <strong class="text-white">${secondsElapsed} seconds</strong>. Waiting for other players to complete their puzzles...
            </p>
            <div class="relative flex py-2 items-center justify-center">
                <div class="animate-spin h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full"></div>
            </div>
        </div>
    `;
    
    const card = document.getElementById('crosswordCard');
    if (card) {
        card.style.position = 'relative';
        card.appendChild(overlay);
    }
}

// 📊 UPDATE SOLVERS LIVE PROGRESS LIST
function updateSolversProgress(players) {
    const leaderboard = document.getElementById('leaderboard');
    if (!leaderboard) return;

    // Track score differences for score popping
    if (!window.lastKnownCrosswordScores) window.lastKnownCrosswordScores = {};

    leaderboard.innerHTML = players.map((p, idx) => {
        const pAvatar = p.avatar || "🦁";
        const status = p.hasFinished 
            ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-extrabold border border-emerald-500/20">Finished (${p.completionTime}s)</span>`
            : `<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-extrabold border border-amber-500/20 animate-pulse">Solving...</span>`;

        return `
            <div id="player-score-${p.id}" class="flex justify-between items-center p-3 bg-slate-950/80 border border-slate-850 rounded-xl font-bold text-xs relative">
                <span class="flex items-center space-x-2.5">
                    <span class="text-amber-500 font-black">#${idx+1}</span>
                    <span class="w-6 h-6 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-center">${pAvatar}</span>
                    <span class="text-slate-100">${escapeHTML(p.username)}</span>
                </span>
                <div class="flex items-center gap-3">
                    ${status}
                    <span class="text-amber-400 font-black">${p.score || 0} Pts</span>
                </div>
            </div>
        `;
    }).join('');

    // Trigger score popups
    players.forEach(p => {
        const oldScore = window.lastKnownCrosswordScores[p.id];
        const newScore = p.score || 0;
        if (oldScore !== undefined && newScore > oldScore) {
            const diff = newScore - oldScore;
            setTimeout(() => {
                const parent = document.getElementById(`player-score-${p.id}`);
                if (parent) {
                    const floater = document.createElement('span');
                    floater.className = 'floating-points';
                    floater.innerText = `+${diff}`;
                    floater.style.right = '12px';
                    floater.style.top = '6px';
                    parent.appendChild(floater);
                    setTimeout(() => floater.remove(), 1200);
                }
            }, 50);
        }
        window.lastKnownCrosswordScores[p.id] = newScore;
    });
}

// ⏱️ GAME ELAPSED TIMER CONTROLLER
function startTimer() {
    if (timerInterval) return;
    
    // Resume or set local timer
    timerInterval = setInterval(() => {
        secondsElapsed++;
        const timerBox = document.getElementById('elapsedTimer');
        if (timerBox) {
            timerBox.innerText = secondsElapsed;
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// 🚀 MULAI PERTANDINGAN (HANYA HOST)
window.startGame = function() {
    if (!isHost) return;
    update(ref(db, 'rooms/' + currentRoomId), { isPlaying: true });
};

// 👑 RENDER SCREEN GAME OVER PODIUM MEWAH
function renderGameOver(playersArr) {
    stopTimer();
    stopTenseBackgroundMusic();

    // Sembunyikan waiting overlay if exists
    const overlay = document.getElementById('waitingOverlay');
    if (overlay) overlay.remove();

    const sorted = [...playersArr].sort((a, b) => b.score - a.score);
    const winner = sorted[0] || { username: "-", id: "" };
    
    if (winner && winner.username !== "-") {
        showCinematicWinner(winner);
    }

    const gridContainer = document.getElementById('crosswordGrid');
    if (gridContainer) {
        const numCols = myLayout ? myLayout.grid[0].length : 5;
        gridContainer.innerHTML = `
            <div style="grid-column: span ${numCols} / span ${numCols};" class="text-center py-6 text-amber-500 font-black uppercase tracking-wider">
                🏆 Teka Teki Silang Completed!
            </div>
        `;
    }

    const tIndicator = document.getElementById('snakesTurnIndicator');
    if (tIndicator) {
        tIndicator.innerHTML = `🏆 <strong class="text-amber-400">MULTIPLAYER CROSSWORD COMPLETED!</strong>`;
    }

    // Pencatatan Statistik Pengguna ke Database
    if (!statsRecorded) {
        statsRecorded = true;
        const myPlayerObj = playersArr.find(p => p.id === myId);
        if (myPlayerObj) {
            const isWinner = (myId === winner.id);
            const scoreEarned = myPlayerObj.score || 0;
            const statsRef = ref(db, `users/${myId}/stats`);
            runTransaction(statsRef, (currentStats) => {
                if (!currentStats) {
                    currentStats = { matches: 0, wins: 0, totalScore: 0 };
                }
                return {
                    matches: (currentStats.matches || 0) + 1,
                    wins: (currentStats.wins || 0) + (isWinner ? 1 : 0),
                    totalScore: (currentStats.totalScore || 0) + scoreEarned
                };
            }).catch(err => {
                console.error("Gagal menyimpan statistik:", err);
            });
        }
    }

    setTimeout(() => {
        if (isHost) {
            set(ref(db, 'rooms/' + currentRoomId), null).then(() => {
                window.location.href = "index.html";
            });
        } else {
            window.location.href = "index.html";
        }
    }, 6000);
}

// 🚪 LEAVE GAME ROOM
window.leaveGame = function() {
    if (confirm("Are you sure you want to leave this crossword arena?")) {
        if (currentRoomId && myId) {
            set(ref(db, `rooms/${currentRoomId}/players/${myId}`), null)
                .then(() => {
                    window.location.href = "index.html";
                });
        } else {
            window.location.href = "index.html";
        }
    }
};

// 🏆 CINEMATIC WINNER CELEBRATION OVERLAY
let winnerInterval = null;
function showCinematicWinner(winner) {
    if (document.getElementById('winnerCelebrationOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = "winnerCelebrationOverlay";
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '10000';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(2, 6, 23, 0.96)';
    overlay.style.backdropFilter = 'blur(16px)';
    overlay.style.color = '#f8fafc';
    overlay.style.textAlign = 'center';
    overlay.style.padding = '24px';
    overlay.style.overflow = 'hidden';

    const spotlightsHtml = `
        <div class="absolute inset-0 pointer-events-none overflow-hidden">
            <div class="absolute w-[450px] h-[450px] bg-amber-500/10 rounded-full blur-[100px] -top-20 -left-20 animate-pulse-glow" style="animation-duration: 5s;"></div>
            <div class="absolute w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] -bottom-20 -right-20 animate-pulse-glow" style="animation-duration: 7s;"></div>
        </div>
    `;

    const auraClass = winner.title === "Clash Champion" ? "aura-clash-champion" :
                      winner.title === "English Genius" ? "aura-english-genius" :
                      winner.title === "Information Master" ? "aura-information-master" : "";

    const titleClass = winner.title === "Clash Champion" ? "title-clash-champion" :
                       winner.title === "English Genius" ? "title-english-genius" :
                       winner.title === "Information Master" ? "title-information-master" : "text-amber-500 font-bold";

    overlay.innerHTML = `
        ${spotlightsHtml}
        <div class="relative z-50 flex flex-col items-center space-y-6 max-w-md w-full">
            <span class="text-7xl block animate-bounce" style="filter: drop-shadow(0 0 20px rgba(245, 158, 11, 0.4));">🏆</span>
            <h1 class="text-2xl md:text-3xl font-black text-amber-500 tracking-tight uppercase animate-pulse">MATCH COMPLETED!</h1>
            
            <div class="w-full bg-slate-900/60 p-8 rounded-3xl border border-slate-800 flex flex-col items-center space-y-4 shadow-2xl relative overflow-visible mt-4">
                <div class="relative">
                    <div id="winnerAvatarContainer" class="w-24 h-24 bg-slate-950 border-2 border-slate-800 rounded-full flex items-center justify-center text-5xl relative z-10 ${auraClass}">
                        ${winner.avatar || "🦁"}
                    </div>
                </div>
                <div class="text-center">
                    <h3 class="text-xl font-black text-white leading-none">${escapeHTML(winner.username)}</h3>
                    <p class="text-[10px] tracking-widest uppercase mt-2.5 leading-none ${titleClass}">${(winner.title || "KA Novice").toUpperCase()}</p>
                </div>
                <div class="pt-3 border-t border-slate-800/80 w-full flex justify-between items-center text-xs font-semibold">
                    <span class="text-slate-400">Completion Time:</span>
                    <span class="text-amber-400 font-black text-base">${winner.completionTime || 0}s</span>
                </div>
            </div>

            <button onclick="window.location.href='index.html'" class="mt-8 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-black px-8 py-3.5 rounded-2xl shadow-xl shadow-amber-500/10 active:scale-95 transition-all text-sm relative z-50">
                RETURN TO LOBBY 🚪
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
    playGameSound('victory');

    if (winnerInterval) clearInterval(winnerInterval);
    winnerInterval = setInterval(() => {
        triggerWinnerConfetti(winner.title);
    }, 400);
}

function triggerWinnerConfetti(title) {
    let colors = [];
    let particleEmoji = "✨";
    if (title === "Clash Champion") {
        colors = ['#f59e0b', '#eab308', '#fef08a', '#ffffff'];
        particleEmoji = "👑";
    } else if (title === "English Genius") {
        colors = ['#8b5cf6', '#d946ef', '#c084fc', '#ffffff'];
        particleEmoji = "⭐";
    } else if (title === "Information Master") {
        colors = ['#06b6d4', '#10b981', '#67e8f9', '#ffffff'];
        particleEmoji = "⚡";
    } else {
        colors = ['#f59e0b', '#eab308', '#ffffff'];
        particleEmoji = "✨";
    }

    const container = document.getElementById('winnerCelebrationOverlay');
    if (!container) return;

    for (let i = 0; i < 5; i++) {
        const p = document.createElement('div');
        p.innerText = Math.random() > 0.5 ? particleEmoji : "✨";
        p.style.position = 'absolute';
        p.style.left = `${Math.random() * 100}vw`;
        p.style.top = '-30px';
        p.style.fontSize = `${Math.floor(Math.random() * 20) + 12}px`;
        p.style.color = colors[Math.floor(Math.random() * colors.length)];
        p.style.pointerEvents = 'none';
        p.style.zIndex = '40';
        container.appendChild(p);

        p.animate([
            { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
            { transform: `translateY(110vh) rotate(${Math.random() * 720}deg)`, opacity: 0 }
        ], {
            duration: Math.random() * 3000 + 2000,
            easing: 'linear',
            fill: 'forwards'
        });

        setTimeout(() => { p.remove(); }, 5000);
    }
}

// 🌟 DYNAMIC CONFETTI SPARKLES
function triggerCorrectAnswerEffect(title) {
    const effectContainer = document.createElement('div');
    effectContainer.style.position = 'fixed';
    effectContainer.style.top = '0';
    effectContainer.style.left = '0';
    effectContainer.style.width = '100vw';
    effectContainer.style.height = '100vh';
    effectContainer.style.pointerEvents = 'none';
    effectContainer.style.zIndex = '9999';
    effectContainer.style.overflow = 'hidden';
    document.body.appendChild(effectContainer);

    let colors = ['#f59e0b', '#eab308', '#ffffff'];
    let particleEmoji = "✨";
    if (title === "Clash Champion") {
        colors = ['#f59e0b', '#eab308', '#fef08a', '#ffffff'];
        particleEmoji = "👑";
    } else if (title === "English Genius") {
        colors = ['#8b5cf6', '#d946ef', '#c084fc', '#ffffff'];
        particleEmoji = "⭐";
    } else if (title === "Information Master") {
        colors = ['#06b6d4', '#10b981', '#67e8f9', '#ffffff'];
        particleEmoji = "⚡";
    }

    for (let i = 0; i < 35; i++) {
        const particle = document.createElement('div');
        particle.innerText = Math.random() > 0.5 ? particleEmoji : "✨";
        particle.style.position = 'absolute';
        particle.style.left = '50%';
        particle.style.top = '50%';
        particle.style.fontSize = `${Math.floor(Math.random() * 20) + 16}px`;
        particle.style.color = colors[Math.floor(Math.random() * colors.length)];
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 250 + 150;
        const targetX = Math.cos(angle) * velocity;
        const targetY = Math.sin(angle) * velocity;
        const duration = Math.random() * 1.5 + 1;

        effectContainer.appendChild(particle);

        particle.animate([
            { transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)', opacity: 1 },
            { transform: `translate(calc(-50% + ${targetX}px), calc(-50% + ${targetY}px)) scale(1.5) rotate(${Math.random() * 360}deg)`, opacity: 0 }
        ], {
            duration: duration * 1000,
            easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)',
            fill: 'forwards'
        });
    }

    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.pointerEvents = 'none';
    flash.style.background = `radial-gradient(circle, ${colors[0]}44 0%, transparent 70%)`;
    flash.style.opacity = '1';
    effectContainer.appendChild(flash);

    flash.animate([
        { opacity: 1, transform: 'scale(0.8)' },
        { opacity: 0, transform: 'scale(1.2)' }
    ], {
        duration: 1000,
        fill: 'forwards'
    });

    setTimeout(() => {
        effectContainer.remove();
    }, 2500);
}

// 🔊 WEB AUDIO GAME SOUND SYNTHESIZER
window.playGameSound = function(type) {
    if (localStorage.getItem('gameSoundMuted') === 'true') return;
    
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        if (type === 'click') {
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
            
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'correct') {
            const now = ctx.currentTime;
            const freqs = [523.25, 659.25, 783.99, 1046.50];
            freqs.forEach((f, index) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, now + index * 0.08);
                
                gain.gain.setValueAtTime(0.12, now + index * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.25);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start(now + index * 0.08);
                osc.stop(now + index * 0.08 + 0.25);
            });
        } else if (type === 'incorrect') {
            const now = ctx.currentTime;
            const notes = [174.61, 155.56, 138.59];
            notes.forEach((f, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(f, now + idx * 0.12);
                
                gain.gain.setValueAtTime(0.12, now + idx * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.3);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start(now + idx * 0.12);
                osc.stop(now + idx * 0.12 + 0.3);
            });
        } else if (type === 'victory') {
            const now = ctx.currentTime;
            const chord = [261.63, 329.63, 392.00, 523.25];
            chord.forEach((f, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(f, now + idx * 0.1);
                
                gain.gain.setValueAtTime(0.08, now + idx * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.7);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start(now + idx * 0.1);
                osc.stop(now + idx * 0.1 + 0.7);
            });
        }
    } catch (e) {
        console.warn("Audio error: ", e);
    }
};

window.toggleSound = function() {
    const current = localStorage.getItem('gameSoundMuted') === 'true';
    localStorage.setItem('gameSoundMuted', !current ? 'true' : 'false');
    updateSoundButtonUI();
    if (current) {
        setTimeout(() => { playGameSound('correct'); }, 50);
        if (roomData && roomData.isPlaying) {
            startTenseBackgroundMusic();
        }
    } else {
        stopTenseBackgroundMusic();
    }
};

window.updateSoundButtonUI = function() {
    const muted = localStorage.getItem('gameSoundMuted') === 'true';
    const btn = document.getElementById('btnSoundToggle');
    if (btn) {
        btn.innerHTML = muted ? "🔇" : "🔊";
        btn.title = muted ? "Turn Sound On" : "Turn Sound Off";
    }
};

// 🎵 BACKGROUND MUSIC SYNTHETIC SCHEDULER
let bgMusicContext = null;
let bgMusicInterval = null;
let currentTenseBeat = 0;

window.startTenseBackgroundMusic = function() {
    if (localStorage.getItem('gameSoundMuted') === 'true') return;
    if (bgMusicInterval) return;

    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        bgMusicContext = new AudioContext();
        
        if (bgMusicContext.state === 'suspended') {
            const resumeAudio = () => {
                if (bgMusicContext && bgMusicContext.state === 'suspended') {
                    bgMusicContext.resume();
                }
                window.removeEventListener('click', resumeAudio);
                window.removeEventListener('touchstart', resumeAudio);
            };
            window.addEventListener('click', resumeAudio);
            window.addEventListener('touchstart', resumeAudio);
        }
        
        bgMusicInterval = setInterval(() => {
            if (!bgMusicContext || localStorage.getItem('gameSoundMuted') === 'true') return;
            const now = bgMusicContext.currentTime;
            
            if (currentTenseBeat % 2 === 0) {
                const osc = bgMusicContext.createOscillator();
                const gain = bgMusicContext.createGain();
                osc.type = 'triangle';
                const freq = (currentTenseBeat % 4 === 0) ? 110.00 : 116.54; // A2 -> Bb2
                osc.frequency.setValueAtTime(freq, now);
                
                gain.gain.setValueAtTime(0.04, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
                
                osc.connect(gain);
                gain.connect(bgMusicContext.destination);
                osc.start(now);
                osc.stop(now + 0.4);
            } else {
                const osc = bgMusicContext.createOscillator();
                const gain = bgMusicContext.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, now);
                
                gain.gain.setValueAtTime(0.015, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
                
                osc.connect(gain);
                gain.connect(bgMusicContext.destination);
                osc.start(now);
                osc.stop(now + 0.06);
            }
            
            currentTenseBeat++;
        }, 600);
    } catch(e) {
        console.warn("Background music error: ", e);
    }
};

window.stopTenseBackgroundMusic = function() {
    if (bgMusicInterval) {
        clearInterval(bgMusicInterval);
        bgMusicInterval = null;
    }
    if (bgMusicContext) {
        bgMusicContext.close();
        bgMusicContext = null;
    }
};

// Global click event listener for interactive sound elements
window.addEventListener('click', (e) => {
    const btn = e.target.closest('button, a, [role="button"], select');
    if (btn) {
        if (btn.id === 'btnSoundToggle') return;
        playGameSound('click');
    }
});
