import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ⚠️ KONFIGURASI FIREBASE (Harus sama dengan app.js)
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

import { snakesQuestions } from "./snakes_questions.js?v=1.1";
const techQuestions = snakesQuestions;

// 🪜 PETA KOTAK ULAR TANGGA SESUAI ATURAN USER
const boardModifiers = {
    // Tangga (Naik)
    8: 13,
    18: 65,
    27: 46,
    60: 61,
    68: 89,

    // Ular (Turun)
    82: 59,
    98: 19,
    96: 76,
    74: 52,
    67: 25,
    48: 28
};

let myId = "";
let myUsername = "";
let currentRoomId = "";
let myTitle = "KA Novice";
let isHost = false;
let roomData = null;
let localTimerInterval = null;
let transitionTimeout = null; // Timer transisi giliran otomatis di sisi host
let statsRecorded = false;

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

// 🔐 AUTENTIKASI REALTIME & REDIRECT JIKA BELUM LOGIN
onAuthStateChanged(auth, (user) => {
    if (user) {
        updateSoundButtonUI();
        myId = user.uid;
        myUsername = user.displayName || "Guest_" + user.uid.substring(0, 4);
        
        onValue(ref(db, `users/${myId}`), (snap) => {
            const data = snap.val() || {};
            const myAvatar = data.avatar || "🦁";
            myTitle = data.title || "KA Novice";
            const navAvatarEl = document.getElementById('navAvatar');
            if (navAvatarEl) navAvatarEl.innerText = myAvatar;
        }, { onlyOnce: true });

        document.getElementById('navUsername').innerText = myUsername;

        // Ambil Room ID dari parameter URL (?roomId=XXXX)
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('roomId');

        if (!currentRoomId) {
            alert("Room ID not found!");
            window.location.href = "index.html";
            return;
        }

        document.getElementById('roomTitle').innerText = `ROOM: ${currentRoomId}`;
        listenToRoom();
    } else {
        window.location.href = "index.html";
    }
});

// 📢 ERROR UTILITY DI UI
window.showError = function(message) {
    const banner = document.getElementById('authErrorBanner');
    const text = document.getElementById('authErrorText');
    if (banner && text) {
        text.innerText = message;
        banner.classList.remove('hidden');
    }
};

window.clearAuthError = function() {
    const banner = document.getElementById('authErrorBanner');
    if (banner) {
        banner.classList.add('hidden');
    }
};

// 🕹️ LOGIKA REALTIME MONITOR DATABASE
function listenToRoom() {
    injectReactionsPanel();
    onValue(ref(db, 'rooms/' + currentRoomId), (snapshot) => {
        roomData = snapshot.val();
        if (!roomData) {
            alert("Room has been deleted!");
            window.location.href = "index.html";
            return;
        }

        if (roomData.isPlaying && roomData.statusMessage === "PLAYING") {
            startTenseBackgroundMusic();
        } else {
            stopTenseBackgroundMusic();
        }

        // Tentukan apakah user adalah host
        isHost = (roomData.hostId === myId);

        const playersArr = Object.values(roomData.players || {});
        
        // Render Board, Scoreboard, dan panel kontrol host
        renderBoard(playersArr);
        updateScoreboard(playersArr);

        // Check for new reactions
        const nowCheck = Date.now();
        playersArr.forEach(p => {
            if (p.reaction && p.reaction.timestamp && (nowCheck - p.reaction.timestamp < 2000)) {
                const reactionKey = `${p.id}_${p.reaction.timestamp}`;
                if (!window.processedReactions) window.processedReactions = new Set();
                if (!window.processedReactions.has(reactionKey)) {
                    window.processedReactions.add(reactionKey);
                    triggerFloatingReaction(p.id, p.reaction.emoji);
                }
            }
        });
        
        const startBtn = document.getElementById('startBtn');
        if (isHost && !roomData.isPlaying) {
            startBtn.classList.remove('hidden');
        } else {
            startBtn.classList.add('hidden');
        }

        // Jalankan render game jika sudah dimulai
        if (roomData.isPlaying) {
            if (isHost && !roomData.snakesQuestions) {
                initializeSnakesQuestions();
                return;
            }

            if (isHost && roomData.currentRound === 0) {
                nextRound();
            } else if (roomData.snakesQuestions) {
                renderGameScreen(playersArr);
            }

            // TRANSISE GILIRAN REAKTIF (HANYA HOST)
            if (isHost && roomData.statusMessage !== "PLAYING" && roomData.statusMessage !== "GAME_OVER") {
                if (!transitionTimeout) {
                    transitionTimeout = setTimeout(() => {
                        transitionTimeout = null;
                        let nextIdx = (roomData.currentTurnIdx + 1) % playersArr.length;
                        update(ref(db, 'rooms/' + currentRoomId), { currentTurnIdx: nextIdx });
                        nextRound();
                    }, 4000);
                }
            } else {
                if (transitionTimeout) {
                    clearTimeout(transitionTimeout);
                    transitionTimeout = null;
                }
            }
        }
    });
}

// 🚀 MULAI PERTANDINGAN (HANYA HOST)
window.startGame = function() {
    if (!isHost) return;
    update(ref(db, 'rooms/' + currentRoomId), { isPlaying: true });
};

function initializeSnakesQuestions() {
    if (!isHost) return;
    const shuffled = [...techQuestions].sort(() => 0.5 - Math.random());
    update(ref(db, 'rooms/' + currentRoomId), {
        snakesQuestions: shuffled
    });
}

function nextRound() {
    if (!isHost) return;
    let round = roomData.currentRound;

    // Ambil soal secara berurutan sesuai ronde dari snakesQuestions yang sudah diacak
    const questionsPool = roomData.snakesQuestions || techQuestions;
    let qIndex = round % questionsPool.length;
    let q = questionsPool[qIndex];

    const roundEndTime = Date.now() + 25500; // 25 seconds + 500ms padding
    update(ref(db, 'rooms/' + currentRoomId), {
        currentRound: round + 1,
        activeQuestion: q.quiz,
        activeAnswer: q.answer,
        activeOptions: q.options,
        timer: 25, 
        roundEndTime: roundEndTime,
        diceRoll: 0,
        statusMessage: "PLAYING"
    });
}

// ⏱️ LOCAL VISUAL COUNTDOWN TIMER
function startLocalVisualTimer() {
    if (localTimerInterval) return;
    localTimerInterval = setInterval(() => {
        if (!roomData || !roomData.roundEndTime || roomData.statusMessage !== "PLAYING") {
            clearInterval(localTimerInterval);
            localTimerInterval = null;
            return;
        }
        
        const remainingMs = roomData.roundEndTime - Date.now();
        const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
        
        const timerBox = document.getElementById('timerBox');
        if (timerBox) {
            timerBox.innerText = seconds;
        }
        
        // Host checks for timeout
        if (isHost && remainingMs <= 0) {
            clearInterval(localTimerInterval);
            localTimerInterval = null;
            handleTimeOut();
        }
    }, 200);
}

// KETIKA WAKTU HABIS
function handleTimeOut() {
    if (!isHost) return;
    if (localTimerInterval) {
        clearInterval(localTimerInterval);
        localTimerInterval = null;
    }
    const playersArr = Object.values(roomData.players);
    const activePlayer = playersArr[roomData.currentTurnIdx];
    
    update(ref(db, 'rooms/' + currentRoomId), {
        diceRoll: 0,
        statusMessage: `Time's up for ${activePlayer.username}! Answer: ${roomData.activeAnswer}`
    });
}

// 🎮 RENDER GAME SCREEN ULAR TANGGA
function renderGameScreen(playersArr) {
    if (roomData.statusMessage === "PLAYING" && roomData.roundEndTime) {
        startLocalVisualTimer();
    }

    if (roomData.statusMessage === "GAME_OVER") {
        const winner = playersArr.sort((a,b) => b.position - a.position)[0];
        if (winner) {
            showCinematicWinner(winner);
        }
        document.getElementById('questionBox').innerHTML = `
            <div class="text-center space-y-3">
                <span class="text-5xl block animate-bounce">👑</span>
                <h4 class="text-xl font-black text-amber-500">GAME OVER!</h4>
                <p class="text-sm font-semibold">The winner is: <strong>${escapeHTML(winner.username)}</strong></p>
                <p class="text-xs text-slate-500">Returning to main lobby in 5 seconds...</p>
            </div>
        `;
        document.getElementById('optionsArea').classList.add('hidden');
        document.getElementById('diceDisplay').classList.add('hidden');
        
        if (localTimerInterval) {
            clearInterval(localTimerInterval);
            localTimerInterval = null;
        }

        // Record user stats locally to Firebase once game finishes
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
                }).then(() => {
                    console.log("Statistics saved successfully.");
                }).catch(err => {
                    console.error("Failed to save statistics:", err);
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
        }, 5000);
        return;
    }

    const qBox = document.getElementById('questionBox');
    const optionsArea = document.getElementById('optionsArea');
    const diceDisplay = document.getElementById('diceDisplay');
    const turnIndicator = document.getElementById('snakesTurnIndicator');

    let activePlayer = playersArr[roomData.currentTurnIdx];
    if (!activePlayer) return;

    // 1. Tampilkan status game (kocokan dadu / status jawaban)
    if (roomData.statusMessage !== "PLAYING") {
        qBox.innerHTML = `<span class="text-sm text-amber-400 font-bold leading-relaxed">${escapeHTML(roomData.statusMessage)}</span>`;
        optionsArea.classList.add('hidden');
        
        if (roomData.diceRoll > 0) {
            diceDisplay.classList.remove('hidden');
            const rollKey = `${roomData.diceRoll}_${roomData.statusMessage}`;
            if (window.lastProcessedRollKey !== rollKey) {
                window.lastProcessedRollKey = rollKey;
                animateDiceRoll(roomData.diceRoll);
            }
        } else {
            diceDisplay.classList.add('hidden');
        }
        return;
    }

    diceDisplay.classList.add('hidden');

    // 2. Giliran menjawab
    if (activePlayer.id === myId) {
        turnIndicator.innerHTML = `🌟 <strong class="text-amber-400">YOUR TURN!</strong> Solve this question to roll the dice.`;
        qBox.innerHTML = `<span class="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Question:</span>
                          <span class="text-sm font-black text-slate-100">${roomData.activeQuestion}</span>`;
        optionsArea.classList.remove('hidden');
        optionsArea.innerHTML = (roomData.activeOptions || []).map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx); // A, B, C, D
            return `
                <button onclick="sendAnswer('${escapeHTML(opt).replace(/'/g, "\\'")}')" class="w-full bg-slate-850 hover:bg-slate-800 border border-slate-750 hover:border-amber-500 text-slate-200 font-bold p-3 rounded-xl transition text-xs text-left flex items-center space-x-2.5 active:scale-[0.98] group relative overflow-hidden">
                    <span class="w-5 h-5 rounded-lg bg-slate-950 text-amber-500 text-[10px] font-black flex items-center justify-center border border-slate-800 group-hover:border-amber-500/30 transition-all">${letter}</span>
                    <span>${escapeHTML(opt)}</span>
                </button>
            `;
        }).join('');
    } else {
        turnIndicator.innerHTML = `⏳ <strong class="text-slate-200">${escapeHTML(activePlayer.username)}</strong> is answering...`;
        qBox.innerHTML = `<span class="text-xs text-slate-400">Waiting for ${escapeHTML(activePlayer.username)} to answer...</span>`;
        optionsArea.classList.add('hidden');
    }
}

// 🎯 KIRIM JAWABAN (MULTIPLE CHOICE)
window.sendAnswer = function(selectedAnswer) {
    if (localTimerInterval) {
        clearInterval(localTimerInterval);
        localTimerInterval = null;
    }
    
    let isCorrect = selectedAnswer.trim().toLowerCase() === roomData.activeAnswer.toLowerCase();
    
    // Add visual correctness animations
    const card = document.getElementById('snakesQuestionCard');
    if (card) {
        card.classList.remove('shake-anim', 'flash-green-border', 'flash-red-border');
        void card.offsetWidth; // Force reflow
        if (isCorrect) {
            card.classList.add('flash-green-border');
        } else {
            card.classList.add('shake-anim', 'flash-red-border');
        }
    }

    if (isCorrect) {
        triggerCorrectAnswerEffect(myTitle);
        playGameSound('correct');
    } else {
        playGameSound('incorrect');
    }
    
    if (!isCorrect) {
        update(ref(db, 'rooms/' + currentRoomId), {
            diceRoll: 0,
            statusMessage: `Incorrect answer by ${myUsername}! Correct Answer: ${roomData.activeAnswer}`
        });
    } else {
        // Benar: kocok dadu (1-6)
        let dice = Math.floor(Math.random() * 6) + 1;
        let currentP = roomData.players[myId];
        let newPos = currentP.position + dice;
        
        // Perhitungan Skor berdasarkan Kecepatan Menjawab (Speed Bonus)
        const remainingMs = roomData.roundEndTime ? (roomData.roundEndTime - Date.now()) : 0;
        const timerSec = Math.max(0, Math.ceil(remainingMs / 1000));
        const speedBonus = timerSec * 10;
        const roundScore = 50 + speedBonus;

        // Aturan Bounce Back (Memantul jika melebihi 100)
        let bounceMsg = "";
        if (newPos > 100) {
            const excess = newPos - 100;
            newPos = 100 - excess;
            bounceMsg = ` (Bounced back ${excess} steps!)`;
        }

        // Papan Modifikasi Ular & Tangga
        let bonusMsg = "";
        if (boardModifiers[newPos]) {
            let finalPos = boardModifiers[newPos];
            bonusMsg = finalPos > newPos ? " 🪜 Climbed a Ladder!" : " 🐍 Bitten by a Snake!";
            newPos = finalPos;
        }

        // Bonus Pemenang jika mencapai kotak 100 pertama kali
        let winBonus = 0;
        if (newPos === 100) {
            winBonus = 1000;
        }

        update(ref(db, `rooms/${currentRoomId}/players/${myId}`), {
            position: newPos,
            score: currentP.score + roundScore + winBonus
        });

        update(ref(db, 'rooms/' + currentRoomId), {
            diceRoll: dice,
            statusMessage: `${myUsername} is correct! Dice: ${dice}.${bounceMsg}${bonusMsg} (+${roundScore + winBonus} Pts)`
        });

        // Cek jika mencapai kotak 100 tepat
        if (newPos === 100) {
            setTimeout(() => {
                update(ref(db, 'rooms/' + currentRoomId), { statusMessage: "GAME_OVER" });
            }, 3000);
        }
    }
};

// 📊 UPDATE KLASEMEN / LEADERBOARD
function updateScoreboard(players) {
    const sorted = [...players].sort((a,b) => b.score - a.score);
    
    if (!window.lastKnownSnakesScores) window.lastKnownSnakesScores = {};

    document.getElementById('leaderboard').innerHTML = sorted.map((p, idx) => `
        <div id="player-score-${p.id}" class="flex justify-between items-center p-3 bg-slate-950 border border-slate-850 rounded-xl font-bold text-xs relative transition duration-300">
            <span class="flex items-center space-x-2">
                <span class="text-amber-500 font-extrabold">#${idx+1}</span>
                <span class="w-6 h-6 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-center">${p.avatar || "🦁"}</span>
                <span>${escapeHTML(p.username)} (Tile ${p.position})</span>
            </span>
            <span class="text-amber-400 font-black">${p.score} Pts</span>
        </div>
    `).join('');

    // Trigger floating score pops
    players.forEach(p => {
        const oldScore = window.lastKnownSnakesScores[p.id];
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
        window.lastKnownSnakesScores[p.id] = newScore;
    });
}

// Helper reactions on board modifiers
function triggerLadderClimbEffect() {
    triggerCorrectAnswerEffect("English Genius");
}

function triggerSnakeBiteEffect() {
    const board = document.getElementById('boardGrid');
    if (board) {
        board.classList.remove('shake-anim');
        void board.offsetWidth;
        board.classList.add('shake-anim');
        setTimeout(() => board.classList.remove('shake-anim'), 800);
    }
    const card = document.getElementById('snakesQuestionCard');
    if (card) {
        card.classList.remove('shake-anim');
        void card.offsetWidth;
        card.classList.add('shake-anim');
        setTimeout(() => card.classList.remove('shake-anim'), 800);
    }
}

// 🎲 RENDER PETA ULAR TANGGA (100 KOTAK - BOUSTROPHEDON)
function renderBoard(players) {
    const grid = document.getElementById('boardGrid');
    if (!grid) return;

    if (!window.playerVisualPositions) {
        window.playerVisualPositions = {};
    }

    let activeTurnPlayerId = "";
    if (roomData && roomData.players) {
        const playersArr = Object.values(roomData.players);
        const activePlayer = playersArr[roomData.currentTurnIdx];
        if (activePlayer) activeTurnPlayerId = activePlayer.id;
    }

    // Step-by-step visually transition coordinates client-side
    let needsAnimation = false;
    players.forEach(p => {
        const targetPos = p.position || 1;
        const visualPos = window.playerVisualPositions[p.id];

        if (visualPos === undefined) {
            window.playerVisualPositions[p.id] = targetPos;
        } else if (visualPos !== targetPos) {
            needsAnimation = true;
            const diff = targetPos - visualPos;
            const step = diff > 0 ? 1 : -1;
            window.playerVisualPositions[p.id] += step;
            
            // Subtle sound when moving cell-by-cell
            playGameSound('click');

            if (window.playerVisualPositions[p.id] === targetPos) {
                // Landed at final position
                if ([8, 18, 27, 60, 68].includes(targetPos)) {
                    triggerLadderClimbEffect();
                } else if ([82, 98, 96, 74, 67, 48].includes(targetPos)) {
                    triggerSnakeBiteEffect();
                }
            }
        }
    });

    grid.innerHTML = "";
    
    // Grid 10x10 boustrophedon
    for (let r = 9; r >= 0; r--) {
        let isEvenRow = (r % 2 === 0);
        for (let c = 0; c < 10; c++) {
            let cellNumber = isEvenRow ? (r * 10 + c + 1) : (r * 10 + (10 - c));
            
            // Find players who visually occupy this square currently
            let playersInSquare = players.filter(p => window.playerVisualPositions[p.id] === cellNumber);
            
            let icons = playersInSquare.map(p => {
                const pAvatar = p.avatar || "🦁";
                const isActive = (p.id === activeTurnPlayerId);
                const activeClass = isActive ? "active-turn" : "";
                return `<span class="player-token ${activeClass}" title="${escapeHTML(p.username)}">${pAvatar}</span>`;
            }).join('');

            let modifierTag = "";
            if ([8, 18, 27, 60, 68].includes(cellNumber)) {
                modifierTag = " 🪜";
            } else if ([82, 98, 96, 74, 67, 48].includes(cellNumber)) {
                modifierTag = " 🐍";
            }

            grid.innerHTML += `
                <div class="h-full aspect-square border border-amber-500/25 bg-slate-950/45 hover:bg-slate-900/50 transition flex flex-col justify-between p-1 text-white font-extrabold rounded-md shadow-sm">
                    <span class="text-amber-400/90 font-black text-[9px] leading-none">${cellNumber}${modifierTag}</span>
                    <div class="flex gap-0.5 flex-wrap justify-end">
                        ${icons}
                    </div>
                </div>
            `;
        }
    }

    if (needsAnimation) {
        if (window.boardAnimationTimeout) clearTimeout(window.boardAnimationTimeout);
        window.boardAnimationTimeout = setTimeout(() => {
            renderBoard(players);
        }, 220);
    }
}

// 🚪 KELUAR DARI GAME
window.leaveGame = function() {
    if (confirm("Are you sure you want to leave the match?")) {
        if (currentRoomId && myId) {
            // Hapus data pemain dari database room
            set(ref(db, `rooms/${currentRoomId}/players/${myId}`), null)
                .then(() => {
                    window.location.href = "index.html";
                });
        } else {
            window.location.href = "index.html";
        }
    }
};

// 🌟 ANIMASI JAWABAN BENAR UNTUK TITLE KHUSUS
function triggerCorrectAnswerEffect(title) {
    if (title !== "Clash Champion" && title !== "English Genius" && title !== "Information Master") return;

    // Create container
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
    }

    // Create 35 floating particles
    for (let i = 0; i < 35; i++) {
        const particle = document.createElement('div');
        particle.innerText = Math.random() > 0.5 ? particleEmoji : "✨";
        particle.style.position = 'absolute';
        particle.style.left = '50%';
        particle.style.top = '50%';
        particle.style.fontSize = `${Math.floor(Math.random() * 20) + 16}px`;
        particle.style.color = colors[Math.floor(Math.random() * colors.length)];
        
        // Random angle and speed
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 250 + 150; // pixels
        const targetX = Math.cos(angle) * velocity;
        const targetY = Math.sin(angle) * velocity;
        const duration = Math.random() * 1.5 + 1; // seconds

        // Add to document
        effectContainer.appendChild(particle);

        // Animate
        particle.animate([
            { transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)', opacity: 1 },
            { transform: `translate(calc(-50% + ${targetX}px), calc(-50% + ${targetY}px)) scale(1.5) rotate(${Math.random() * 360}deg)`, opacity: 0 }
        ], {
            duration: duration * 1000,
            easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)', // out-cubic fallback
            fill: 'forwards'
        });
    }

    // Flash background highlight
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

    // Cleanup container
    setTimeout(() => {
        effectContainer.remove();
    }, 2500);
}

// 🎭 LIVE REACTION PANEL INJECTOR
function injectReactionsPanel() {
    if (document.getElementById('reactionsPanel')) return;
    const panel = document.createElement('div');
    panel.id = "reactionsPanel";
    panel.className = "fixed bottom-4 right-4 z-40 bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl flex items-center gap-1.5 shadow-2xl backdrop-blur-md";
    panel.innerHTML = `
        <button onclick="sendReaction('😂')" class="hover:scale-125 transition text-base">😂</button>
        <button onclick="sendReaction('😮')" class="hover:scale-125 transition text-base">😮</button>
        <button onclick="sendReaction('🤔')" class="hover:scale-125 transition text-base">🤔</button>
        <button onclick="sendReaction('😡')" class="hover:scale-125 transition text-base">😡</button>
        <button onclick="sendReaction('🔥')" class="hover:scale-125 transition text-base">🔥</button>
        <button onclick="sendReaction('👑')" class="hover:scale-125 transition text-base">👑</button>
    `;
    document.body.appendChild(panel);
}

window.sendReaction = function(emoji) {
    if (!currentRoomId || !myId) return;
    update(ref(db, `rooms/${currentRoomId}/players/${myId}`), {
        reaction: {
            emoji: emoji,
            timestamp: Date.now()
        }
    });
};

function listenToReactions() {
    // Deprecated, handeled inside room state checker
}

function triggerFloatingReaction(uid, emoji) {
    const playerEl = document.getElementById(`player-score-${uid}`);
    if (!playerEl) return;

    const floatEl = document.createElement('span');
    floatEl.innerText = emoji;
    floatEl.style.position = 'absolute';
    floatEl.style.left = '10px';
    floatEl.style.top = '10px';
    floatEl.style.fontSize = '20px';
    floatEl.style.pointerEvents = 'none';
    floatEl.style.zIndex = '50';
    playerEl.appendChild(floatEl);

    floatEl.animate([
        { transform: 'translateY(0) scale(0.8)', opacity: 1 },
        { transform: 'translateY(-65px) scale(1.4)', opacity: 0 }
    ], {
        duration: 1500,
        easing: 'ease-out',
        fill: 'forwards'
    });

    setTimeout(() => {
        floatEl.remove();
    }, 1600);
}

// 🏆 CINEMATIC WINNER CELEBRATION OVERLAY
let winnerInterval = null;
function showCinematicWinner(winner) {
    if (document.getElementById('winnerCelebrationOverlay')) return;

    // Sembunyikan panel reaksi agar tidak menumpuk di atas layar victory
    const reactions = document.getElementById('reactionsPanel');
    if (reactions) reactions.remove();

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
                    <span class="text-slate-400">Final Rank:</span>
                    <span class="text-amber-400 font-black text-base">Tile ${winner.position || 0}</span>
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

// 🎲 3D DICE ROLLING ANIMATION
function animateDiceRoll(value) {
    const cube = document.getElementById('cube');
    const resultText = document.getElementById('diceResultText');
    if (!cube || !resultText) return;

    // Start rolling animation
    cube.classList.add('rolling');
    resultText.innerText = "ROLLING DICE...";
    playGameSound('dice');

    setTimeout(() => {
        // Stop rolling
        cube.classList.remove('rolling');
        
        // Rotate to final face
        let transformStr = "";
        switch (value) {
            case 1: transformStr = "rotateY(0deg)"; break;
            case 2: transformStr = "rotateY(180deg)"; break;
            case 3: transformStr = "rotateY(-90deg)"; break;
            case 4: transformStr = "rotateY(90deg)"; break;
            case 5: transformStr = "rotateX(-90deg)"; break;
            case 6: transformStr = "rotateX(90deg)"; break;
            default: transformStr = "rotateY(0deg)"; break;
        }
        cube.style.transform = transformStr;
        resultText.innerText = `Dadu menunjukkan angka: ${value}`;
    }, 1000);
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
        } else if (type === 'dice') {
            const now = ctx.currentTime;
            for (let i = 0; i < 8; i++) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(700 - i * 70, now + i * 0.08);
                
                gain.gain.setValueAtTime(0.08, now + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.06);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start(now + i * 0.08);
                osc.stop(now + i * 0.08 + 0.06);
            }
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
        if (roomData && roomData.isPlaying && roomData.statusMessage === "PLAYING") {
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

// ⌨️ GLOBAL KEYBOARD SHORTCUTS FOR SNAKES & LADDERS
window.addEventListener('keydown', (e) => {
    // Ignore keydown if user is typing in general input fields
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
    }

    if (!roomData || !roomData.activeQuestion || roomData.statusMessage !== "PLAYING") return;
    
    // Check if it is currently my turn
    const playersArr = Object.values(roomData.players || {});
    const activePlayer = playersArr[roomData.currentTurnIdx];
    if (!activePlayer || activePlayer.id !== myId) return;

    const key = e.key.toLowerCase();
    const optionKeys = ['a', 'b', 'c', 'd', '1', '2', '3', '4'];
    const keyIdx = optionKeys.indexOf(key);
    if (keyIdx !== -1) {
        const index = keyIdx % 4;
        const buttons = document.querySelectorAll('#optionsArea button');
        if (buttons[index]) {
            buttons[index].click();
        }
    }
});
