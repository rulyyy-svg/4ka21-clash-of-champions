import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { quizQuestions } from "./quiz_questions.js?v=1.2";

// ⚠️ KONFIGURASI FIREBASE KAMU
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
let localTimerInterval = null;
let transitionTimeout = null;
let statsRecorded = false;

// Sentence Builder Local State
let sentenceRoundId = 0;
let sentenceSourceWords = [];
let sentenceTargetWords = [];

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
        
        // Ambil User profile data dari DB untuk Avatar dan Title
        onValue(ref(db, `users/${myId}`), (snap) => {
            const data = snap.val() || {};
            myAvatar = data.avatar || "🦁";
            myTitle = data.title || "KA Novice";
            
            document.getElementById('navUsername').innerText = myUsername;
            document.getElementById('navAvatar').innerText = myAvatar;
        }, { onlyOnce: true });

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

// 🕹️ LOGIKA MONITOR REALTIME ROOM
function listenToRoom() {
    injectReactionsPanel();
    onValue(ref(db, 'rooms/' + currentRoomId), (snapshot) => {
        roomData = snapshot.val();
        if (!roomData) {
            alert("Room has been deleted!");
            window.location.href = "index.html";
            return;
        }

        if (roomData.isPlaying && roomData.statusMessage && roomData.statusMessage.includes("dimulai!")) {
            startTenseBackgroundMusic();
        } else {
            stopTenseBackgroundMusic();
        }

        isHost = (roomData.hostId === myId);

        const playersArr = Object.values(roomData.players || {});
        
        // Update Live Scoreboard
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

        // Host Controller Setup
        const startBtn = document.getElementById('startBtn');
        const hostPanel = document.getElementById('hostPanel');
        
        if (isHost && !roomData.isPlaying) {
            hostPanel.classList.remove('hidden');
            startBtn.classList.remove('hidden');
            document.getElementById('hostStatus').innerText = "You are the host. Click the button above to start!";
        } else if (isHost && roomData.isPlaying) {
            hostPanel.classList.remove('hidden');
            startBtn.classList.add('hidden');
            document.getElementById('hostStatus').innerText = "Match is in progress...";
        } else {
            hostPanel.classList.add('hidden');
        }

        // Jalankan game jika sudah dimulai
        if (roomData.isPlaying) {
            // Inisialisasi 20 Soal Acak (Hanya Host)
            if (isHost && !roomData.playerQuestions) {
                initializeQuizQuestions();
                return;
            }

            if (isHost && roomData.currentRound === 0) {
                nextRound();
            } else if (roomData.playerQuestions) {
                renderGameScreen(playersArr);
            }

            // CEK APAKAH SEMUA PEMAIN SUDAH MENJAWAB (HANYA HOST)
            const allAnswered = playersArr.length > 0 && playersArr.every(p => p.hasAnswered);
            if (isHost && roomData.statusMessage === "PLAYING" && allAnswered) {
                if (localTimerInterval) {
                    clearInterval(localTimerInterval);
                    localTimerInterval = null;
                }
                update(ref(db, 'rooms/' + currentRoomId), {
                    statusMessage: "ROUND_END"
                });
            }

            // SINKRONISASI JEDA DETIK TRANSISI KE RONDE BERIKUTNYA (HANYA HOST)
            if (isHost && roomData.statusMessage === "ROUND_END") {
                if (!transitionTimeout) {
                    transitionTimeout = setTimeout(() => {
                        transitionTimeout = null;
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

    // Listen to Activity Logs
    onValue(ref(db, `rooms/${currentRoomId}/activityLogs`), (snapshot) => {
        const logsData = snapshot.val() || {};
        const container = document.getElementById('activityLog');
        if (!container) return;

        const sortedLogs = Object.values(logsData).sort((a, b) => b.timestamp - a.timestamp);
        if (sortedLogs.length === 0) {
            container.innerHTML = `<div class="py-1">Waiting for player activity...</div>`;
            return;
        }

        container.innerHTML = sortedLogs.map(log => `
            <div class="py-1 border-b border-slate-800/30 flex justify-between gap-2">
                <span>${escapeHTML(log.text)}</span>
            </div>
        `).join('');
    });
}

// 📦 INISIALISASI 20 SOAL ACAK UNTUK SETIAP PEMAIN DI ROOM (HANYA HOST)
function initializeQuizQuestions() {
    if (!isHost) return;
    
    const playersArr = Object.values(roomData.players || {});
    const playerQuestionsMap = {};
    
    playersArr.forEach(player => {
        // Shuffle 100 soal dan ambil 20 pertama untuk masing-masing pemain
        const shuffled = [...quizQuestions].sort(() => Math.random() - 0.5);
        playerQuestionsMap[player.id] = shuffled.slice(0, 20);
    });

    // Save to Firebase room
    update(ref(db, `rooms/${currentRoomId}`), {
        playerQuestions: playerQuestionsMap
    });
}

// 🚀 MULAI PERTANDINGAN (HANYA HOST)
window.startGame = function() {
    if (!isHost) return;
    update(ref(db, 'rooms/' + currentRoomId), { isPlaying: true });
};

// ⏱️ LANJUT KE RONDE BERIKUTNYA (HANYA HOST)
function nextRound() {
    if (!isHost) return;
    
    let round = roomData.currentRound || 0;
    if (round >= 20) {
        update(ref(db, 'rooms/' + currentRoomId), {
            statusMessage: "GAME_OVER"
        });
        return;
    }

    // Reset status menjawab para pemain
    const playersKeys = Object.keys(roomData.players || {});
    playersKeys.forEach(pId => {
        const playerObj = roomData.players[pId];
        const newStreak = playerObj.hasAnswered ? (playerObj.streak || 0) : 0;
        update(ref(db, `rooms/${currentRoomId}/players/${pId}`), {
            hasAnswered: false,
            lastAnswerCorrect: false,
            streak: newStreak
        });
    });

    const roundEndTime = Date.now() + 20500; // 20 seconds + 500ms padding
    update(ref(db, 'rooms/' + currentRoomId), {
        currentRound: round + 1,
        timer: 20,
        roundEndTime: roundEndTime,
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

// ⏳ TIMEOUT HANDLING (HANYA HOST)
function handleTimeOut() {
    if (!isHost) return;
    update(ref(db, 'rooms/' + currentRoomId), {
        statusMessage: "ROUND_END"
    });
}

// 🎨 RENDERING GAME SCREEN
function renderGameScreen(playersArr) {
    document.getElementById('roundTitle').innerText = `Round ${roomData.currentRound} / 20`;
    if (roomData.statusMessage === "PLAYING" && roomData.roundEndTime) {
        startLocalVisualTimer();
    }

    if (roomData.statusMessage === "GAME_OVER") {
        renderGameOver(playersArr);
        return;
    }

    const round = roomData.currentRound;
    const myQuestions = roomData.playerQuestions ? roomData.playerQuestions[myId] : null;
    const q = (myQuestions && round > 0) ? myQuestions[round - 1] : null;
    if (!q) return;

    const qBox = document.getElementById('questionBox');
    const imageContainer = document.getElementById('imageContainer');
    const questionImage = document.getElementById('questionImage');
    const textInputArea = document.getElementById('textInputArea');
    const scrambleBadgeArea = document.getElementById('scrambleBadgeArea');
    const sentenceBuilderArea = document.getElementById('sentenceBuilderArea');
    const optionsArea = document.getElementById('optionsArea');
    const turnIndicator = document.getElementById('turnIndicator');

    // Sembunyikan semua input area terlebih dahulu
    textInputArea.classList.add('hidden');
    scrambleBadgeArea.classList.add('hidden');
    sentenceBuilderArea.classList.add('hidden');
    optionsArea.classList.add('hidden');
    imageContainer.classList.add('hidden');

    const myPlayer = roomData.players[myId];
    const myHasAnswered = myPlayer ? myPlayer.hasAnswered : false;

    // FASE REVIEW KUNCI JAWABAN (ROUND_END)
    if (roomData.statusMessage === "ROUND_END") {
        let isCorrect = myPlayer ? myPlayer.lastAnswerCorrect : false;
        let earned = myPlayer ? (myPlayer.lastScoreBonus || 0) : 0;
        
        if (myHasAnswered) {
            turnIndicator.innerHTML = isCorrect 
                ? `<span class="text-emerald-400 font-extrabold text-sm">✅ YOUR ANSWER IS CORRECT! (+${earned} Pts)</span>` 
                : `<span class="text-rose-400 font-extrabold text-sm">❌ YOUR ANSWER IS INCORRECT! Answer: <strong class="underline">${escapeHTML(q.answer)}</strong></span>`;
        } else {
            turnIndicator.innerHTML = `<span class="text-rose-400 font-extrabold text-sm">⏳ TIME'S UP! Answer: <strong class="underline">${escapeHTML(q.answer)}</strong></span>`;
        }
        
        qBox.innerHTML = `
            <div class="flex flex-col items-center gap-1">
                <span class="text-xs text-slate-500 font-bold uppercase tracking-wider">Correct Answer for this Round:</span>
                <span class="text-amber-500 font-black text-xl uppercase tracking-wide text-glow">${escapeHTML(q.answer)}</span>
            </div>
        `;
        return;
    }

    // SUDAH MENJAWAB (WAITING)
    if (myHasAnswered) {
        turnIndicator.innerHTML = `⏳ Your answer has been submitted! Waiting for other players...`;
        qBox.innerHTML = `<span class="text-slate-400 font-bold italic text-sm">Waiting for round to complete...</span>`;
        return;
    }

    // SEDANG BERMAIN (PLAYING)
    turnIndicator.innerHTML = `🌟 <strong class="text-amber-400">SOLVE THE FOLLOWING QUESTION!</strong> Submit your answer as soon as possible.`;

    if (q.type === 'vocab') {
        qBox.innerText = q.question;
        optionsArea.classList.remove('hidden');
        optionsArea.innerHTML = (q.options || []).map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx); // A, B, C, D
            return `
                <button onclick="submitMultipleChoice('${escapeHTML(opt).replace(/'/g, "\\'")}')" class="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/50 text-slate-200 font-bold p-3 rounded-xl transition text-xs text-left flex items-center space-x-2.5 active:scale-[0.98] group relative overflow-hidden">
                    <span class="w-5 h-5 rounded-lg bg-slate-950 text-amber-500 text-[10px] font-black flex items-center justify-center border border-slate-850 group-hover:border-amber-500/30 transition-all">${letter}</span>
                    <span>${escapeHTML(opt)}</span>
                </button>
            `;
        }).join('');
    } 
    else if (q.type === 'picture') {
        qBox.innerText = q.question;
        imageContainer.classList.remove('hidden');
        questionImage.src = q.imageUrl;
        optionsArea.classList.remove('hidden');
        optionsArea.innerHTML = (q.options || []).map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            return `
                <button onclick="submitMultipleChoice('${escapeHTML(opt).replace(/'/g, "\\'")}')" class="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/50 text-slate-200 font-bold p-3 rounded-xl transition text-xs text-left flex items-center space-x-2.5 active:scale-[0.98] group relative overflow-hidden">
                    <span class="w-5 h-5 rounded-lg bg-slate-950 text-amber-500 text-[10px] font-black flex items-center justify-center border border-slate-850 group-hover:border-amber-500/30 transition-all">${letter}</span>
                    <span>${escapeHTML(opt)}</span>
                </button>
            `;
        }).join('');
    }
    else if (q.type === 'scramble') {
        qBox.innerText = `${q.question}`;
        textInputArea.classList.remove('hidden');
        scrambleBadgeArea.classList.remove('hidden');

        const letters = q.scrambled.split('-');
        scrambleBadgeArea.innerHTML = letters.map(char => `
            <button onclick="appendScrambleLetter('${escapeHTML(char)}')" class="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 text-slate-200 font-extrabold px-3.5 py-2 rounded-xl text-xs transition keycap-tile shadow-md">
                ${escapeHTML(char)}
            </button>
        `).join('') + `
            <button onclick="clearScrambleInput()" class="bg-rose-950/20 border border-rose-900/30 hover:bg-rose-950/40 text-rose-400 font-black px-3.5 py-2 rounded-xl text-xs transition active:scale-90">
                🔄 Clear
            </button>
        `;
    }
    else if (q.type === 'sentence') {
        qBox.innerText = q.question;
        sentenceBuilderArea.classList.remove('hidden');
        initializeSentenceBuilder(q);
    }
}

// 🔠 SCRAMBLE UTILITIES
window.appendScrambleLetter = function(char) {
    const input = document.getElementById('answerInput');
    if (input) input.value += char.toLowerCase();
};

window.clearScrambleInput = function() {
    const input = document.getElementById('answerInput');
    if (input) input.value = "";
};

window.submitTextAnswer = function() {
    const input = document.getElementById('answerInput');
    if (!input) return;
    const answer = input.value.trim();
    if (!answer) return alert("Answer cannot be empty!");
    input.value = "";
    submitAnswerLogic(answer);
};

// 🎯 MULTIPLE CHOICE UTILITIES
window.submitMultipleChoice = function(selectedOption) {
    submitAnswerLogic(selectedOption);
};

// 📋 SENTENCE BUILDER SINKRONISASI LOKAL
function initializeSentenceBuilder(q) {
    if (sentenceRoundId === roomData.currentRound) return;
    sentenceRoundId = roomData.currentRound;
    sentenceSourceWords = [...q.scrambled];
    sentenceTargetWords = [];
    renderSentenceBuilderUI();
}

function renderSentenceBuilderUI() {
    const sourceBank = document.getElementById('sentenceSourceBank');
    const targetContainer = document.getElementById('sentenceTargetContainer');
    
    if (sentenceSourceWords.length === 0) {
        sourceBank.innerHTML = `<span class="text-[10px] text-slate-650 font-bold italic">Semua kata sudah terpasang</span>`;
    } else {
        sourceBank.innerHTML = sentenceSourceWords.map((word, idx) => `
            <button onclick="clickSourceWord(${idx})" class="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 hover:border-amber-500/20">
                ${escapeHTML(word)}
            </button>
        `).join('');
    }
    
    if (sentenceTargetWords.length === 0) {
        targetContainer.innerHTML = `<span class="text-[10px] text-slate-600 font-bold italic">Susun kalimat dengan klik kata di atas...</span>`;
    } else {
        targetContainer.innerHTML = sentenceTargetWords.map((word, idx) => `
            <button onclick="clickTargetWord(${idx})" class="bg-amber-500 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-black transition active:scale-95 shadow-md shadow-amber-500/10 hover:bg-amber-400">
                ${escapeHTML(word)}
            </button>
        `).join('');
    }
}

window.clickSourceWord = function(idx) {
    const word = sentenceSourceWords.splice(idx, 1)[0];
    sentenceTargetWords.push(word);
    renderSentenceBuilderUI();
};

window.clickTargetWord = function(idx) {
    const word = sentenceTargetWords.splice(idx, 1)[0];
    sentenceSourceWords.push(word);
    renderSentenceBuilderUI();
};

window.resetSentence = function() {
    const round = roomData.currentRound;
    const myQuestions = roomData.playerQuestions ? roomData.playerQuestions[myId] : null;
    const q = (myQuestions && round > 0) ? myQuestions[round - 1] : null;
    if (!q) return;
    sentenceSourceWords = [...q.scrambled];
    sentenceTargetWords = [];
    renderSentenceBuilderUI();
};

window.submitSentenceAnswer = function() {
    if (sentenceTargetWords.length === 0) return alert("Please assemble the sentence first!");
    const answer = sentenceTargetWords.join(' ');
    submitAnswerLogic(answer);
};

// 📌 LOGIKA UTAMA SUBMIT JAWABAN
function submitAnswerLogic(answer) {
    const round = roomData.currentRound;
    const myQuestions = roomData.playerQuestions ? roomData.playerQuestions[myId] : null;
    const q = (myQuestions && round > 0) ? myQuestions[round - 1] : null;
    if (!q) return;

    const isCorrect = answer.trim().toLowerCase() === q.answer.trim().toLowerCase();

    // Trigger visual screen effects on the main card container
    const quizCard = document.getElementById('quizWrapperCard');
    if (quizCard) {
        quizCard.classList.remove('shake-anim', 'flash-green-border', 'flash-red-border');
        void quizCard.offsetWidth; // Force CSS reflow to restart animations
        if (isCorrect) {
            quizCard.classList.add('flash-green-border');
        } else {
            quizCard.classList.add('shake-anim', 'flash-red-border');
        }
    }

    if (isCorrect) {
        triggerCorrectAnswerEffect(myTitle);
        playGameSound('correct');
    } else {
        playGameSound('incorrect');
    }
    const remainingMs = roomData.roundEndTime ? (roomData.roundEndTime - Date.now()) : 0;
    const timer = Math.max(0, Math.ceil(remainingMs / 1000));
    const scoreBonus = isCorrect ? (50 + (timer * 10)) : 0;
    
    const timeTaken = Math.max(0, 20 - timer);
    const statusText = isCorrect 
        ? `🟢 ${myUsername} answered CORRECTLY (+${scoreBonus} Pts) in ${timeTaken} seconds` 
        : `🔴 ${myUsername} answered INCORRECTLY in ${timeTaken} seconds`;

    const myPlayer = roomData.players[myId];
    const currentStreak = isCorrect ? ((myPlayer.streak || 0) + 1) : 0;

    // Update Player Status di Firebase
    update(ref(db, `rooms/${currentRoomId}/players/${myId}`), {
        hasAnswered: true,
        lastAnswerCorrect: isCorrect,
        lastScoreBonus: scoreBonus,
        score: (roomData.players[myId].score || 0) + scoreBonus,
        streak: currentStreak
    });

    // Posisikan ke Feed/Log Aktivitas di Firebase
    const logKey = Math.random().toString(36).substring(2, 8);
    set(ref(db, `rooms/${currentRoomId}/activityLogs/${logKey}`), {
        text: statusText,
        timestamp: Date.now()
    });
}

// 📊 RENDER SCOREBOARD LIVE
function updateScoreboard(players) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const container = document.getElementById('leaderboard');
    if (!container) return;

    // Track score differences for floating animations
    if (!window.lastKnownScores) window.lastKnownScores = {};

    container.innerHTML = sorted.map((p, idx) => {
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
        const pAvatar = p.avatar || "🦁";
        const pTitle = p.title || "KA Novice";
        
        const streakCount = p.streak || 0;
        const streakBadge = streakCount >= 3 ? `<span class="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-black animate-pulse flex items-center gap-0.5">🔥 x${streakCount}</span>` : "";
        const streakClass = streakCount >= 3 ? "border-red-500 shadow-md shadow-red-500/10" : "border-slate-800";

        return `
            <div id="player-score-${p.id}" class="flex justify-between items-center p-3 bg-slate-950/80 border ${streakClass} rounded-xl relative transition duration-300">
                <div class="flex items-center space-x-2.5">
                    <span class="text-xs font-black text-amber-500 w-5 text-center">${medal}</span>
                    <span class="text-sm bg-slate-900 w-7 h-7 rounded-full border border-slate-800 flex items-center justify-center relative ${streakCount >= 3 ? 'animate-bounce' : ''}">${pAvatar}</span>
                    <div class="flex flex-col">
                        <span class="font-extrabold text-white text-xs leading-none flex items-center">${escapeHTML(p.username)} ${streakBadge}</span>
                        <span class="text-[8px] text-slate-500 font-bold uppercase mt-0.5 tracking-wider">${pTitle}</span>
                    </div>
                </div>
                <span class="text-amber-400 font-black text-xs relative flex items-center gap-1">${p.score || 0} Pts</span>
            </div>
        `;
    }).join('');

    // Trigger floating effects
    players.forEach(p => {
        const oldScore = window.lastKnownScores[p.id];
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
        window.lastKnownScores[p.id] = newScore;
    });
}

// 👑 RENDER SCREEN GAME OVER PODIUM MEWAH
function renderGameOver(playersArr) {
    const qBox = document.getElementById('questionBox');
    const imageContainer = document.getElementById('imageContainer');
    const textInputArea = document.getElementById('textInputArea');
    const scrambleBadgeArea = document.getElementById('scrambleBadgeArea');
    const sentenceBuilderArea = document.getElementById('sentenceBuilderArea');
    const optionsArea = document.getElementById('optionsArea');
    const turnIndicator = document.getElementById('turnIndicator');

    imageContainer.classList.add('hidden');
    textInputArea.classList.add('hidden');
    scrambleBadgeArea.classList.add('hidden');
    sentenceBuilderArea.classList.add('hidden');
    optionsArea.classList.add('hidden');

    if (localTimerInterval) {
        clearInterval(localTimerInterval);
        localTimerInterval = null;
    }

    const sorted = [...playersArr].sort((a, b) => b.score - a.score);
    const winner = sorted[0] || { username: "-", id: "" };
    if (winner && winner.username !== "-") {
        showCinematicWinner(winner);
    }

    turnIndicator.innerHTML = `🏆 <strong class="text-amber-455 animate-pulse">MULTIPLAYER SMART QUIZ COMPLETED!</strong>`;
    
    qBox.innerHTML = `
        <div class="text-center space-y-4 py-4 w-full">
            <span class="text-5xl block animate-bounce">👑</span>
            <h4 class="text-xl font-black text-amber-500 uppercase tracking-wider">MAIN PODIUM</h4>
            
            <div class="flex justify-center items-end gap-4 mt-6 max-w-sm mx-auto">
                <!-- Juara 2 -->
                ${sorted[1] ? `
                <div class="flex flex-col items-center">
                    <span class="text-2xl">${sorted[1].avatar || "🦊"}</span>
                    <span class="text-[10px] font-bold text-slate-400 mt-1 max-w-[80px] truncate">${escapeHTML(sorted[1].username)}</span>
                    <div class="bg-slate-900 border border-slate-800 w-16 h-16 rounded-t-xl mt-2 flex flex-col justify-center items-center shadow-md">
                        <span class="text-lg font-black text-slate-350">🥈</span>
                        <span class="text-[9px] text-slate-400 font-bold">${sorted[1].score} Pts</span>
                    </div>
                </div>
                ` : ''}

                <!-- Juara 1 -->
                <div class="flex flex-col items-center">
                    <span class="text-3xl">${winner.avatar || "🦁"}</span>
                    <span class="text-[11px] font-black text-amber-500 mt-1 max-w-[90px] truncate">${escapeHTML(winner.username)}</span>
                    <div class="bg-amber-500/10 border border-amber-500/30 w-20 h-24 rounded-t-2xl mt-2 flex flex-col justify-center items-center shadow-lg shadow-amber-500/5">
                        <span class="text-2xl font-black text-amber-400">🥇</span>
                        <span class="text-xs text-amber-400 font-black">${winner.score || 0} Pts</span>
                    </div>
                </div>

                <!-- Juara 3 -->
                ${sorted[2] ? `
                <div class="flex flex-col items-center">
                    <span class="text-2xl">${sorted[2].avatar || "🐉"}</span>
                    <span class="text-[10px] font-bold text-slate-400 mt-1 max-w-[80px] truncate">${escapeHTML(sorted[2].username)}</span>
                    <div class="bg-slate-900 border border-slate-800 w-16 h-12 rounded-t-xl mt-2 flex flex-col justify-center items-center shadow-md">
                        <span class="text-lg font-black text-amber-600">🥉</span>
                        <span class="text-[9px] text-slate-500 font-bold">${sorted[2].score} Pts</span>
                    </div>
                </div>
                ` : ''}
            </div>

            <p class="text-[10px] text-slate-500 pt-4 font-semibold">Returning to main lobby in 6 seconds...</p>
        </div>
    `;

    // Pencatatan Statistik Pengguna
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
                console.log("Statistik kuis berhasil diperbarui.");
            }).catch(err => {
                console.error("Gagal memperbarui stats:", err);
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

// 🚪 MENINGGALKAN PERTANDINGAN
window.leaveGame = function() {
    if (confirm("Are you sure you want to leave this quiz?")) {
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
                    <span class="text-slate-400">Final Score:</span>
                    <span class="text-amber-400 font-black text-base">${winner.score || 0} Pts</span>
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

// ⌨️ GLOBAL KEYBOARD SHORTCUTS FOR SMART QUIZ
window.addEventListener('keydown', (e) => {
    // Ignore if typing in another input (but allow answerInput Enter submission)
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        if (activeEl.id === 'answerInput' && e.key === 'Enter') {
            submitTextAnswer();
        }
        return;
    }

    if (!roomData || !roomData.playerQuestions || roomData.statusMessage !== "PLAYING") return;
    
    const round = roomData.currentRound;
    const myQuestions = roomData.playerQuestions ? roomData.playerQuestions[myId] : null;
    const q = (myQuestions && round > 0) ? myQuestions[round - 1] : null;
    if (!q) return;
    
    const myPlayer = roomData.players[myId];
    if (myPlayer && myPlayer.hasAnswered) return;

    const key = e.key.toLowerCase();

    // 1. Multiple Choice Questions
    if (q.type === 'vocab' || q.type === 'picture') {
        const optionKeys = ['a', 'b', 'c', 'd', '1', '2', '3', '4'];
        const keyIdx = optionKeys.indexOf(key);
        if (keyIdx !== -1) {
            const index = keyIdx % 4;
            const buttons = document.querySelectorAll('#optionsArea button');
            if (buttons[index]) {
                buttons[index].click();
            }
        }
    }
    // 2. Scramble Words Question
    else if (q.type === 'scramble') {
        if (e.key === 'Enter') {
            submitTextAnswer();
        } else if (e.key === 'Backspace') {
            clearScrambleInput();
        } else if (e.key.length === 1) {
            const char = e.key.toUpperCase();
            const buttons = document.querySelectorAll('#scrambleBadgeArea button');
            for (let btn of buttons) {
                if (btn.innerText.trim() === char) {
                    btn.click();
                    break;
                }
            }
        }
    }
    // 3. Sentence Builder Question
    else if (q.type === 'sentence') {
        if (e.key === 'Enter') {
            submitSentenceAnswer();
        } else if (e.key === 'Backspace') {
            resetSentence();
        }
    }
});
