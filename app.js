import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, runTransaction, remove, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, updateProfile, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// Data bank soal lokal untuk backward-compatibility dan pencegahan crash
const gameQuestions = {
    scramble: [
        { quiz: 'O-A-P-P-L', answer: 'APPLE' },
        { quiz: 'E-H-O-U-S', answer: 'HOUSE' },
        { quiz: 'T-E-A-W-R', answer: 'WATER' },
        { quiz: 'O-H-S-O-C-L', answer: 'SCHOOL' }
    ],
    picture: [
        { quiz: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=400', answer: 'FOOD' },
        { quiz: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?q=80&w=400', answer: 'CAT' },
        { quiz: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=400', answer: 'NATURE' }
    ],
    sentence: [
        { quiz: ['am', 'I', 'a', 'student'], answer: 'I am a student' },
        { quiz: ['cat', 'The', 'is', 'sleeping'], answer: 'The cat is sleeping' }
    ],
    quiz: [
        { quiz: 'What is the synonym of "Big"?', options: ['Small', 'Large', 'Tiny', 'Thin'], answer: 'Large' },
        { quiz: 'Which one is a fruit?', options: ['Carrot', 'Potato', 'Mango', 'Broccoli'], answer: 'Mango' }
    ]
};

let myId = "";
let myUsername = "";
let myAvatar = "🦁";
let myTitle = "KA Novice";
let myStats = { matches: 0, wins: 0, totalScore: 0 };
let currentRoomId = "";
let isHost = false;
let roomData = null;
let timerInterval = null;
let isLoginMode = false; // Status form auth: false = Register, true = Login
let userProfileListener = null;
let isAdmin = false;
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

// 📢 TAMPILKAN / BERSIHKAN PESAN ERROR DI UI
window.showError = function (message) {
    const banner = document.getElementById('authErrorBanner');
    const text = document.getElementById('authErrorText');
    if (banner && text) {
        text.innerText = message;
        banner.classList.remove('hidden');
        // Trigger reflow
        banner.offsetHeight;
        banner.classList.remove('scale-95', 'opacity-0');
        banner.classList.add('scale-100', 'opacity-100');
    }
};

window.clearAuthError = function () {
    const banner = document.getElementById('authErrorBanner');
    if (banner) {
        banner.classList.remove('scale-100', 'opacity-100');
        banner.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            banner.classList.add('hidden');
        }, 300);
    }
};

// ⏱️ LOADING STATE CONTROLLER
function setAuthLoading(isLoading, activeBtnId) {
    const btnIds = ['btnMainAuth', 'btnGoogleAuth', 'btnGuestAuth'];
    btnIds.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = isLoading;
            if (isLoading) {
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
    });

    const activeBtn = document.getElementById(activeBtnId);
    if (activeBtn) {
        if (isLoading) {
            activeBtn.dataset.originalHtml = activeBtn.innerHTML;
            activeBtn.innerHTML = `
                <svg class="animate-spin h-4 w-4 text-current inline mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Memproses...</span>
            `;
        } else if (activeBtn.dataset.originalHtml) {
            activeBtn.innerHTML = activeBtn.dataset.originalHtml;
        }
    }
}

// 👁️ SHOW/HIDE PASSWORD FIELD
window.togglePasswordVisibility = function () {
    const passwordInput = document.getElementById('authPassword');
    const eyeIconOpen = document.getElementById('eyeIconOpen');
    const eyeIconClosed = document.getElementById('eyeIconClosed');

    if (passwordInput && eyeIconOpen && eyeIconClosed) {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            eyeIconOpen.classList.add('hidden');
            eyeIconClosed.classList.remove('hidden');
        } else {
            passwordInput.type = 'password';
            eyeIconOpen.classList.remove('hidden');
            eyeIconClosed.classList.add('hidden');
        }
    }
};

// 🔄 PROSES HASIL REDIRECT GOOGLE
getRedirectResult(auth)
    .then((result) => {
        if (result) {
            console.log("Sukses login Google lewat redirect:", result.user.displayName);
        }
    })
    .catch((err) => {
        showError("Gagal masuk dengan Google: " + err.message);
    });

// 🔎 FUNGSI CEK STATUS VERIFIKASI EMAIL
window.checkEmailVerificationStatus = function () {
    clearAuthError();
    if (!auth.currentUser) return showError("Tidak ada user yang aktif. Silakan login kembali.");

    const btn = document.querySelector("#verificationPendingArea button");
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Memeriksa...";
    }

    auth.currentUser.reload()
        .then(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Saya Sudah Verifikasi (Masuk)";
            }
            if (auth.currentUser.emailVerified) {
                location.reload();
            } else {
                showError("Email Anda belum diverifikasi! Silakan periksa kembali email Anda.");
            }
        })
        .catch((err) => {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Saya Sudah Verifikasi (Masuk)";
            }
            showError("Gagal memuat status: " + err.message);
        });
};

// 📧 FUNGSI KIRIM ULANG EMAIL VERIFIKASI
window.resendVerificationEmail = function () {
    clearAuthError();
    if (!auth.currentUser) return showError("Tidak ada user yang aktif.");

    const btn = document.getElementById('btnResendVerification');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Mengirim...";
    }

    sendEmailVerification(auth.currentUser)
        .then(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Kirim Ulang Link Verifikasi";
            }
            showError("Link verifikasi baru telah dikirim ke email Anda!");
        })
        .catch((err) => {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Kirim Ulang Link Verifikasi";
            }
            showError("Gagal mengirim email verifikasi: " + err.message);
        });
};

// 🔐 MONITOR STATUS LOGIN USER SECARA REALTIME
onAuthStateChanged(auth, (user) => {
    setAuthLoading(false, 'btnMainAuth');
    setAuthLoading(false, 'btnGoogleAuth');
    setAuthLoading(false, 'btnGuestAuth');

    const authFormArea = document.getElementById('authFormArea');
    const verificationPendingArea = document.getElementById('verificationPendingArea');

    if (user) {
        // Cek jika pengguna masuk menggunakan provider password (email/password) dan belum diverifikasi
        const isEmailUser = user.providerData.some(p => p.providerId === 'password');
        if (isEmailUser && !user.emailVerified) {
            // Tampilkan layar verifikasi email
            if (authFormArea) authFormArea.classList.add('hidden');
            if (verificationPendingArea) {
                verificationPendingArea.classList.remove('hidden');
                document.getElementById('verificationEmailDisplay').innerText = user.email;
            }

            // Sembunyikan konten game
            document.getElementById('authArea').classList.remove('hidden');
            document.getElementById('mainGameContent').classList.add('hidden');
            document.getElementById('lobby').classList.add('hidden');
            document.getElementById('roomArea').classList.add('hidden');
            document.getElementById('gameArea').classList.add('hidden');
            return;
        }

        // Pengguna terverifikasi (atau Google/Guest), izinkan masuk
        updateSoundButtonUI();
        myId = user.uid;
        myUsername = user.displayName || "Guest_" + user.uid.substring(0, 4);

        isAdmin = (user.email === '1ka21.classs@gmail.com' || user.email === '1ka21.class@gmail.com');
        const adminPanel = document.getElementById('adminPanel');
        if (isAdmin) {
            if (adminPanel) adminPanel.classList.remove('hidden');
        } else {
            if (adminPanel) adminPanel.classList.add('hidden');
        }

        if (authFormArea) authFormArea.classList.remove('hidden');
        if (verificationPendingArea) verificationPendingArea.classList.add('hidden');

        document.getElementById('authArea').classList.add('hidden');
        document.getElementById('mainGameContent').classList.remove('hidden');
        document.getElementById('lobby').classList.remove('hidden');
        document.getElementById('navUsername').innerText = myUsername;

        listenToUserProfile(myId);
        listenToActiveRooms();
        loadGlobalLeaderboard();
        switchTab('arena');
    } else {
        isAdmin = false;
        const adminPanel = document.getElementById('adminPanel');
        if (adminPanel) adminPanel.classList.add('hidden');

        if (authFormArea) authFormArea.classList.remove('hidden');
        if (verificationPendingArea) verificationPendingArea.classList.add('hidden');

        document.getElementById('authArea').classList.remove('hidden');
        document.getElementById('mainGameContent').classList.add('hidden');
        document.getElementById('lobby').classList.add('hidden');
        document.getElementById('roomArea').classList.add('hidden');
        document.getElementById('gameArea').classList.add('hidden');

        if (userProfileListener) {
            if (typeof userProfileListener === 'function') userProfileListener();
            userProfileListener = null;
        }
        if (activeRoomsListener) {
            if (typeof activeRoomsListener === 'function') activeRoomsListener();
            activeRoomsListener = null;
        }
    }
});

// 🔄 TOGGLE INTERFACES REGISTER VS LOGIN
window.toggleAuthMode = function () {
    clearAuthError();
    isLoginMode = !isLoginMode;
    const nameField = document.getElementById('registerNameField');
    const mainBtn = document.getElementById('btnMainAuth');
    const toggleText = document.getElementById('authToggleText');
    const toggleBtn = document.getElementById('authToggleBtn');

    if (isLoginMode) {
        nameField.classList.add('hidden');
        mainBtn.innerText = "Sign In to Account 🚀";
        toggleText.innerText = "Don't have an account?";
        toggleBtn.innerText = "Register New";
    } else {
        nameField.classList.remove('hidden');
        mainBtn.innerText = "Register New Account";
        toggleText.innerText = "Already have an account?";
        toggleBtn.innerText = "Sign In here";
    }
};

// 📧 PROSES LOGIN & DAFTAR EMAIL
window.handleEmailAuth = function () {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const username = document.getElementById('authUsername').value;

    if (!email || !password) return alert("Email & Password cannot be empty!");

    if (isLoginMode) {
        // 🔑 AKSI LOGIN
        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Opsional: Cek apakah email sudah diverifikasi sebelum mengizinkan masuk
                if (!userCredential.user.emailVerified) {
                    alert("Your account is not active. Please check your email inbox to verify first!");
                    signOut(auth); // Paksa logout jika belum verifikasi
                }
            })
            .catch(err => alert("Failed to Sign In: " + err.message));
    } else {
        // 📧 AKSI DAFTAR BARU
        if (!username) return alert("Please specify your username!");
        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                const user = userCredential.user;

                // 1. Set Nama Panggilan (Display Name)
                updateProfile(user, { displayName: username }).then(() => {

                    // 2. Kirim Link Verifikasi ke Email User
                    sendEmailVerification(user)
                        .then(() => {
                            alert(`Registration successful! 🦉\nA verification link has been sent to ${email}. Please check your email inbox (or spam folder) before logging in.`);
                            signOut(auth); // Keluar otomatis agar user dipaksa login setelah klik link verifikasi
                        })
                        .catch(err => alert("Failed to send verification email: " + err.message));

                });
            })
            .catch(err => alert("Failed to Register: " + err.message));
    }
};

// 🌐 MASUK MENGGUNAKAN AKUN GOOGLE
window.loginWithGoogle = function () {
    clearAuthError();
    setAuthLoading(true, 'btnGoogleAuth');
    const provider = new GoogleAuthProvider();

    signInWithPopup(auth, provider)
        .then((result) => {
            console.log("Sukses login Google:", result.user.displayName);
        })
        .catch(err => {
            console.error("Popup gagal, mencoba redirect...", err);
            // Fallback ke redirect jika popup terblokir atau gagal
            if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
                signInWithRedirect(auth, provider)
                    .catch(redirErr => {
                        setAuthLoading(false, 'btnGoogleAuth');
                        showError("Gagal masuk dengan Google: " + redirErr.message);
                    });
            } else {
                setAuthLoading(false, 'btnGoogleAuth');
                showError("Gagal masuk dengan Google: " + err.message);
            }
        });
};

// 🕵️‍♂️ MASUK CEPAT SEBAGAI GUEST
window.loginAsGuest = function () {
    clearAuthError();
    setAuthLoading(true, 'btnGuestAuth');
    signInAnonymously(auth)
        .then(() => {
            console.log("Sukses login Guest");
        })
        .catch(err => {
            setAuthLoading(false, 'btnGuestAuth');
            showError("Gagal masuk sebagai Guest: " + err.message);
        });
};

// 🚪 KELUAR / LOGOUT
window.logout = function () {
    console.log("Menjalankan window.logout...");
    signOut(auth)
        .then(() => {
            console.log("window.logout signOut sukses!");
        })
        .catch(err => {
            console.error("window.logout signOut gagal:", err);
            alert("Gagal Keluar: " + err.message);
        });
};

// ==========================================
// 🕹️ LOGIKA ROOM & JALANNYA GAME
// ==========================================

window.createRoom = function () {
    let mode = document.getElementById('gameMode').value;
    currentRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    isHost = true;

    const newRoom = {
        id: currentRoomId, mode: mode, isPlaying: false, currentRound: 0,
        timer: 20, currentTurnIdx: 0, hostId: myId, hostName: myUsername, diceRoll: 0, statusMessage: ""
    };

    set(ref(db, 'rooms/' + currentRoomId), newRoom).then(() => { joinRoomLogic(); });
};

window.joinRoom = function () {
    currentRoomId = document.getElementById('roomInput').value.toUpperCase();
    if (!currentRoomId) return alert("Please enter a Room Code!");
    joinRoomLogic();
};

function joinRoomLogic() {
    set(ref(db, `rooms/${currentRoomId}/players/${myId}`), {
        id: myId, username: myUsername, avatar: myAvatar, title: myTitle, score: 0, position: 1, hasAnswered: false
    }).then(() => { listenToRoom(); }).catch(() => alert("Failed to access room!"));
}

function listenToRoom() {
    onValue(ref(db, 'rooms/' + currentRoomId), (snapshot) => {
        roomData = snapshot.val();
        if (!roomData) return;

        // Hide all tabs & lobby content
        document.getElementById('lobby').classList.add('hidden');
        document.getElementById('leaderboardTab').classList.add('hidden');
        document.getElementById('guideTab').classList.add('hidden');
        document.getElementById('profileTab').classList.add('hidden');

        // Disable tabs navigation during game setup
        const navTabs = document.getElementById('navTabs');
        if (navTabs) {
            navTabs.classList.add('pointer-events-none', 'opacity-50');
        }

        document.getElementById('roomArea').classList.remove('hidden');
        document.getElementById('roomTitle').innerText = `ROOM CODE: ${roomData.id}`;
        document.getElementById('currentModeDisplay').innerText = roomData.mode.toUpperCase();

        const pList = document.getElementById('playerList');
        const playersArr = Object.values(roomData.players || {});
        pList.innerHTML = playersArr.map(p => `<li class="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-slate-200">👤 ${escapeHTML(p.username)}</li>`).join('');

        if (roomData.hostId === myId) document.getElementById('startBtn').classList.remove('hidden');
        if (roomData.isPlaying) {
            const mode = (roomData.mode || "").trim().toLowerCase();
            if (mode === 'snakes') {
                window.location.href = `snakes.html?roomId=${currentRoomId}`;
                return;
            } else if (mode === 'quiz') {
                window.location.href = `quiz.html?roomId=${currentRoomId}`;
                return;
            } else if (mode === 'crossword') {
                window.location.href = `crossword.html?roomId=${currentRoomId}`;
                return;
            }
            renderGameScreen(playersArr);
        }
    });
}

window.startGame = function () {
    if (!isHost) return;
    update(ref(db, 'rooms/' + currentRoomId), { isPlaying: true });
    const mode = (roomData.mode || "").trim().toLowerCase();
    if (mode !== 'snakes' && mode !== 'quiz' && mode !== 'crossword') {
        nextRound();
    }
};

function nextRound() {
    if (!isHost) return;
    let playersArr = Object.values(roomData.players);
    let round = roomData.currentRound;

    playersArr.forEach(p => { update(ref(db, `rooms/${currentRoomId}/players/${p.id}`), { hasAnswered: false }); });

    let pool = roomData.mode;
    if (round >= gameQuestions[pool].length) {
        update(ref(db, 'rooms/' + currentRoomId), { statusMessage: "GAME_OVER" });
        return;
    }

    let q = gameQuestions[pool][round];
    update(ref(db, 'rooms/' + currentRoomId), {
        currentRound: round + 1, activeQuestion: q.quiz, activeAnswer: q.answer,
        activeOptions: q.options || null, timer: 20, diceRoll: 0, statusMessage: "PLAYING"
    });
    startHostTimer();
}

function startHostTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        runTransaction(ref(db, `rooms/${currentRoomId}/timer`), (currentTimer) => {
            if (currentTimer === null) return 0;
            if (currentTimer <= 1) { clearInterval(timerInterval); handleTimeOut(); return 0; }
            return currentTimer - 1;
        });
    }, 1000);
}

function handleTimeOut() {
    if (!isHost) return;
    update(ref(db, 'rooms/' + currentRoomId), { statusMessage: `Waktu Habis! Kunci: ${roomData.activeAnswer}` });
    setTimeout(() => {
        nextRound();
    }, 4000);
}

function renderGameScreen(playersArr) {
    document.getElementById('roomArea').classList.add('hidden');
    document.getElementById('gameArea').classList.remove('hidden');
    document.getElementById('timerBox').innerText = roomData.timer;
    document.getElementById('roundTitle').innerText = `Ronde ${roomData.currentRound}`;

    if (roomData.statusMessage === "GAME_OVER") {
        alert("Game Selesai!");
        location.reload();
        return;
    }

    const qBox = document.getElementById('questionBox');
    const inputArea = document.getElementById('textInputArea');
    const optionsArea = document.getElementById('optionsArea');

    if (roomData.statusMessage !== "PLAYING") {
        qBox.innerHTML = `<span class="text-xl text-red-500 font-bold">Ronde Selesai! Kunci: ${roomData.activeAnswer}</span>`;
        inputArea.classList.add('hidden');
        optionsArea.classList.add('hidden');
        updateLeaderboard(playersArr);
        return;
    }

    if (roomData.mode === 'quiz') {
        qBox.innerText = roomData.activeQuestion;
        inputArea.classList.add('hidden');
        optionsArea.classList.remove('hidden');
        optionsArea.innerHTML = (roomData.activeOptions || []).map(opt => `<button onclick="sendAnswer('${opt}')" class="bg-white border-2 p-3 rounded-xl font-bold hover:border-blue-500">${opt}</button>`).join('');
    } else {
        qBox.innerText = roomData.mode === 'sentence' ? `Susun kata: ${roomData.activeQuestion.join(' - ')}` : `Susun huruf: ${roomData.activeQuestion}`;
        inputArea.classList.remove('hidden');
        optionsArea.classList.add('hidden');
    }
    updateLeaderboard(playersArr);
}

window.sendAnswer = function (optAnswer = null) {
    let answer = optAnswer || document.getElementById('answerInput').value;
    document.getElementById('answerInput').value = "";
    let isCorrect = answer.trim().toLowerCase() === roomData.activeAnswer.toLowerCase();

    let scoreBonus = isCorrect ? (50 + (roomData.timer * 10)) : 0;
    update(ref(db, `rooms/${currentRoomId}/players/${myId}`), { hasAnswered: true, score: roomData.players[myId].score + scoreBonus });
};

function updateLeaderboard(players) {
    const sorted = players.sort((a, b) => b.score - a.score);
    document.getElementById('leaderboard').innerHTML = sorted.map((p, idx) => `
        <div class="flex justify-between items-center p-3 bg-slate-950 border border-slate-850 rounded-xl font-bold text-xs text-slate-200">
            <span>#${idx + 1} ${escapeHTML(p.username)}</span>
            <span class="text-amber-450 font-black">${p.score} Pts</span>
        </div>
    `).join('');
}

// ==========================================
// 🛡️ USER PROFILE & DYNAMIC TABS INTERACTION
// ==========================================

function applyTitleEffects(title, avatarElId, titleElId) {
    const avatarEl = document.getElementById(avatarElId);
    const titleEl = document.getElementById(titleElId);
    if (!avatarEl || !titleEl) return;

    avatarEl.classList.remove('aura-clash-champion', 'aura-english-genius', 'aura-information-master');
    titleEl.classList.remove('title-clash-champion', 'title-english-genius', 'title-information-master');

    if (title === "Clash Champion") {
        avatarEl.classList.add('aura-clash-champion');
        titleEl.classList.add('title-clash-champion');
    } else if (title === "English Genius") {
        avatarEl.classList.add('aura-english-genius');
        titleEl.classList.add('title-english-genius');
    } else if (title === "Information Master") {
        avatarEl.classList.add('aura-information-master');
        titleEl.classList.add('title-information-master');
    }
}

function listenToUserProfile(uid) {
    if (userProfileListener) {
        if (typeof userProfileListener === 'function') userProfileListener();
    }
    const userRef = ref(db, 'users/' + uid);
    userProfileListener = onValue(userRef, (snapshot) => {
        let userData = snapshot.val();
        const user = auth.currentUser;
        const isGuestAccount = user ? user.isAnonymous : true;
        const userEmail = user ? user.email : "";

        if (!userData) {
            userData = {
                username: myUsername,
                avatar: "🦁",
                title: "KA Novice",
                isGuest: isGuestAccount,
                email: userEmail,
                stats: {
                    matches: 0,
                    wins: 0,
                    totalScore: 0
                }
            };
            set(userRef, userData);
        } else {
            let needsUpdate = false;
            const updates = {};
            if (userData.isGuest !== isGuestAccount) {
                userData.isGuest = isGuestAccount;
                updates.isGuest = isGuestAccount;
                needsUpdate = true;
            }
            if (userEmail && userData.email !== userEmail) {
                userData.email = userEmail;
                updates.email = userEmail;
                needsUpdate = true;
            }
            if (needsUpdate) {
                update(userRef, updates);
            }
        }

        myUsername = userData.username || myUsername;
        myAvatar = userData.avatar || "🦁";
        myTitle = userData.title || "KA Novice";
        myStats = userData.stats || { matches: 0, wins: 0, totalScore: 0 };
        isAdmin = userData.isAdmin || (auth.currentUser && (auth.currentUser.email === '1ka21.classs@gmail.com' || auth.currentUser.email === '1ka21.class@gmail.com'));

        // Update Nav UI
        document.getElementById('navUsername').innerText = myUsername;
        document.getElementById('navAvatar').innerText = myAvatar;
        document.getElementById('navTitle').innerText = myTitle;
        applyTitleEffects(myTitle, 'navAvatarContainer', 'navTitle');

        // Update Lobby UI
        document.getElementById('lobbyAvatar').innerText = myAvatar;
        document.getElementById('lobbyUsername').innerText = myUsername;
        document.getElementById('lobbyTitle').innerText = myTitle;
        applyTitleEffects(myTitle, 'lobbyAvatar', 'lobbyTitle');
        document.getElementById('lobbyMatches').innerText = myStats.matches || 0;
        document.getElementById('lobbyWins').innerText = myStats.wins || 0;
        document.getElementById('lobbyScore').innerText = myStats.totalScore || 0;

        renderProfileTab();
    });
}

let activeRoomsListener = null;
function listenToActiveRooms() {
    if (activeRoomsListener) {
        if (typeof activeRoomsListener === 'function') activeRoomsListener();
    }
    const roomsRef = ref(db, 'rooms');
    activeRoomsListener = onValue(roomsRef, (snapshot) => {
        const roomsData = snapshot.val() || {};
        
        // 1. Render Admin rooms list if admin is logged in
        if (isAdmin) {
            const adminContainer = document.getElementById('adminRoomsList');
            if (adminContainer) {
                const allRooms = Object.values(roomsData).filter(r => r && r.id);
                if (allRooms.length === 0) {
                    adminContainer.innerHTML = `
                        <div class="text-center py-4 text-slate-600 text-[10px] font-semibold">
                            No active rooms found in system database.
                        </div>
                    `;
                } else {
                    adminContainer.innerHTML = allRooms.map(room => {
                        const playersCount = Object.keys(room.players || {}).length;
                        const status = room.isPlaying ? "Playing" : "Lobby";
                        const modeName = room.mode === 'snakes' ? 'Snakes' : 'Quiz';
                        return `
                            <div class="flex justify-between items-center p-2 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-semibold text-slate-350 mb-1">
                                <div>
                                    <span class="text-white font-bold">Room ${room.id}</span> (${modeName}) 
                                    <span class="text-slate-500">| ${status} | ${playersCount} players</span>
                                </div>
                                <button onclick="adminDeleteRoom('${room.id}')" class="bg-rose-500/20 hover:bg-rose-600 hover:text-white text-rose-400 px-2 py-1 rounded transition text-[9px] font-black">
                                    DELETE 🗑️
                                </button>
                            </div>
                        `;
                    }).join('');
                }
            }
        }

        const allRooms = Object.values(roomsData).filter(r => r && r.id);
        const activeRooms = allRooms.filter(r => r.isPlaying === true);
        const activeLobbies = allRooms.filter(r => r.isPlaying === false);

        // 1. Render Active Matches
        const container = document.getElementById('activeRoomsContainer');
        if (container) {
            if (activeRooms.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-6 text-slate-500 text-xs font-semibold">
                        🕵️‍♂️ No active matches in progress.
                    </div>
                `;
            } else {
                container.innerHTML = activeRooms.map(room => {
                    const playersCount = Object.keys(room.players || {}).length;
                    const hostName = room.hostName || ((room.players && room.players[room.hostId]) ? room.players[room.hostId].username : "Guest");
                    const modeName = room.mode === 'snakes' ? 'Snakes' : room.mode === 'crossword' ? 'Crossword' : 'Quiz';

                    return `
                        <div class="p-3 bg-slate-950/80 border border-slate-850 rounded-2xl hover:border-emerald-500/20 transition duration-150 flex items-center justify-between gap-3 text-slate-200">
                            <div class="flex flex-col gap-1 min-w-0">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="font-black text-white tracking-wide text-xs">Room ${room.id}</span>
                                    <span class="px-2 py-0.5 rounded-md text-[8px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">${modeName}</span>
                                </div>
                                <span class="text-[10px] text-slate-500 truncate">Host: <strong class="text-slate-400 font-semibold">${escapeHTML(hostName)}</strong></span>
                            </div>
                            <div class="flex items-center gap-2.5 flex-shrink-0">
                                <span class="text-[10px] font-bold text-slate-400 bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-850 flex items-center gap-1">
                                    <span>👤</span><span>${playersCount}/8</span>
                                </span>
                                <button onclick="joinActiveRoom('${room.id}')" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-3.5 py-1.5 rounded-xl transition active:scale-95 text-[10px] shadow-md shadow-emerald-500/10">
                                    JOIN
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // 2. Render Active Lobbies
        const lobbiesContainer = document.getElementById('activeLobbiesContainer');
        if (lobbiesContainer) {
            if (activeLobbies.length === 0) {
                lobbiesContainer.innerHTML = `
                    <div class="text-center py-6 text-slate-500 text-xs font-semibold">
                        🕵️‍♂️ No lobbies waiting. Create one!
                    </div>
                `;
            } else {
                lobbiesContainer.innerHTML = activeLobbies.map(room => {
                    const playersCount = Object.keys(room.players || {}).length;
                    const hostName = room.hostName || ((room.players && room.players[room.hostId]) ? room.players[room.hostId].username : "Guest");
                    const modeName = room.mode === 'snakes' ? 'Snakes' : room.mode === 'crossword' ? 'Crossword' : 'Quiz';

                    return `
                        <div class="p-3 bg-slate-950/80 border border-slate-850 rounded-2xl hover:border-amber-500/20 transition duration-150 flex items-center justify-between gap-3 text-slate-200">
                            <div class="flex flex-col gap-1 min-w-0">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="font-black text-white tracking-wide text-xs">Room ${room.id}</span>
                                    <span class="px-2 py-0.5 rounded-md text-[8px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">${modeName}</span>
                                </div>
                                <span class="text-[10px] text-slate-500 truncate">Host: <strong class="text-slate-400 font-semibold">${escapeHTML(hostName)}</strong></span>
                            </div>
                            <div class="flex items-center gap-2.5 flex-shrink-0">
                                <span class="text-[10px] font-bold text-slate-400 bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-850 flex items-center gap-1">
                                    <span>👤</span><span>${playersCount}/8</span>
                                </span>
                                <button onclick="joinActiveRoom('${room.id}')" class="bg-indigo-600 hover:bg-indigo-500 text-white font-black px-3.5 py-1.5 rounded-xl transition active:scale-95 text-[10px] shadow-md shadow-indigo-600/10">
                                    JOIN
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    });
}

window.joinActiveRoom = function (roomId) {
    const input = document.getElementById('roomInput');
    if (input) {
        input.value = roomId;
        joinRoom();
    }
};

window.switchTab = function (tabId) {
    const tabs = ['arena', 'leaderboard', 'guide', 'profile', 'developer'];
    tabs.forEach(t => {
        const btn = document.getElementById('tab-' + t);
        const container = document.getElementById(t === 'arena' ? 'arenaTab' : t + 'Tab');
        
        if (btn) {
            if (t === tabId) {
                btn.className = "px-4 py-2 text-xs md:text-sm font-black rounded-xl transition duration-300 flex items-center gap-1.5 bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/10";
            } else {
                btn.className = "px-4 py-2 text-xs md:text-sm font-bold text-slate-400 hover:text-slate-200 rounded-xl transition duration-300 flex items-center gap-1.5 hover:bg-slate-800/50";
            }
        }
        
        if (container) {
            if (t === tabId) {
                container.classList.remove('hidden');
            } else {
                container.classList.add('hidden');
            }
        }
    });

    if (tabId === 'leaderboard') {
        loadGlobalLeaderboard();
    } else if (tabId === 'profile') {
        renderProfileTab();
    } else if (tabId === 'developer') {
        renderDeveloperTeam();
    }
};

const developerProfiles = [
    {
        name: "ABU YAZID AL FARROS",
        npm: "10122031",
        traits: ["emosian", "toxic", "punya anak buah banyak", "admin beriman", "Plumpang", "voucher sempak Shopee"]
    },
    {
        name: "ACHMAD FAUZAN NAJIB MUBAROK",
        npm: "11122530",
        traits: ["kaga jelas orangnya", "berpikiran negatif", "musang", "ustad KW", "Top Chart FH UI", "Madura", "palkor", "distributor Sanqua"]
    },
    {
        name: "ALBERT MELKISEDEK PURBA",
        npm: "10122112",
        traits: ["BRILING", "baik", "pendiem", "bapak gembala", "admin arisan", "cucu rektor"]
    },
    {
        name: "ANDERSON RANDY SCIPIO",
        npm: "10122164",
        traits: ["suka mabok", "bapak-bapak", "client", "pria malam", "Unggr"]
    },
    {
        name: "ANDIRA PUTRI NIRMALA",
        npm: "10122172",
        traits: ["kucing", "K-Pop", "risol mayo", "IPK tinggi", "nilai tinggi", "Stray Kids", "kosan bude", "bapak polisi", "BEM FIKTI"]
    },
    {
        name: "ARIZAYA RAMA PUTRA",
        npm: "10122220",
        traits: ["toxic", "liar", "makelar", "malpraktik", "mukcur", "ngantuk", "Bastian", "req member Unggr", "beli tai jual emas", "lupa teman", "spesialis nyari minus", "laptop Victus", "Maeve", "jago nego", "SPV", "living together", "Boboho", "penyembah toilet"]
    },
    {
        name: "DAFFA NAUFAL ARAFI",
        npm: "10122308",
        traits: ["Yamal", "Barcelona", "bandar Kopi Jago", "bandar parfum", "bapak UI/UX Gunadarma", "kang villa", "api TikTok", "req member Pasundan", "ijo", "coklat"]
    },
    {
        name: "DANIELA COSTANTINA PATTIRANE",
        npm: "10122324",
        traits: ["bendahara", "BLACKPINK", "Bali", "bos Kopi Jago", "uang kas", "amanah", "BEM FIKTI"]
    },
    {
        name: "DEWA BAGUS PUTU ARYA DHANANJAYA",
        npm: "10122362",
        traits: ["CEO GNDR", "UKM", "pendiem", "laptop Victus"]
    },
    {
        name: "DIMAS ROBBI KASLANOVA",
        npm: "10122389",
        traits: ["pendiem banget", "prompt AI", "diem-diem bisa", "tangan belang", "mata merah", "rambut Charlie", "Eren", "antek-antek Putin", "PLN"]
    },
    {
        name: "GUSTI DHARMA SATRIA YUDHISTIRA",
        npm: "10122555",
        traits: ["mangu", "Indomaret", "Apip", "CEO yang menyamar", "stiker WA", "atlet"]
    },
    {
        name: "HASYIFAH SAFITRI",
        npm: "10122585",
        traits: ["stupen", "molis", "suka nanya"]
    },
    {
        name: "IAN SHEVA SATRIA RAMADHAN",
        npm: "10122611",
        traits: ["manipulatif", "abang-abangan FPS", "Bernard", "Sheva On 7", "raja parlay", "streamer", "roleplayer", "naga cungkring24"]
    },
    {
        name: "IRFAN AFIF LUTBIANTO",
        npm: "10122636",
        traits: ["gondrong", "Baim", "tingkat 2", "service AC", "multitalenta", "Sunter", "komedian"]
    },
    {
        name: "MAULINA MUSLIMAH MARTIN",
        npm: "10122753",
        traits: ["Padang", "Kemayoran", "pendek", "capybara pink", "kecil", "140 cm"]
    },
    {
        name: "MUHAMMAD ABDUL HAMID RENALDI",
        npm: "10122821",
        traits: ["bandot", "mabok", "alcohol", "Vesmet", "Zeus", "petir", "Pak Ustad", "WD", "peternak naga", "bosku", "filter", "bandar kambing", "maxwin", "lokasi terdekat"]
    },
    {
        name: "MUHAMMAD BAGAS RULIANSYAH",
        npm: "10122855",
        traits: ["founder NASI UDUK OK (NUO)", "menutup", "2027 lamaran", "2028 nikah (aamiin)", "spesialis Hammersonic"]
    },
    {
        name: "MUHAMMAD FATUR RAHMAN",
        npm: "10122911",
        traits: ["Rumah Makan Dapur Uni", "Pagi Sore", "Payakumbuh", "Ajo Mani", "GH", "basecamp", "abangnya Ridho", "punya member", "Tambuso", "tunjang", "rendang", "ayam bakar", "piscok", "kwetiau", "kue lebaran", "dimsum goreng", "Mama Ucok", "bukber", "penginapan", "penggemar Brazil", "love Neymar", "kadang sakit (sange dikit)", "beri aku 10 wanita", "admin badminton PB Johar", "film Fatur"]
    },
    {
        name: "MUHAMMAD IBRAHIMOVIC",
        npm: "10122927",
        traits: ["kalolo", "Banbec", "Apip", "Sungkrinx", "kurus", "cycle", "analisis", "terkam", "Bandung", "aktivis boy", "atlet Russia"]
    },
    {
        name: "MUHAMMAD RIZKY PRATAMA",
        npm: "10122993",
        traits: ["Doyok", "Kiwil", "Cemput", "Dono", "Tunggir", "vintage", "wibu", "ganti sempak", "mobil sauna (mikrolet)", "Ayano", "Mio kuning", "Anita Max Win", "klakson", "babayo", "Muso", "Rohis", "sujud epep", "bapak polisi"]
    },
    {
        name: "MUHAMMAD ZUFRIAL ARIF RAMADHAN",
        npm: "11122022",
        traits: ["OYYYYYYYYYYYYYYYYYYY", "senpai", "komik", "wibu", "penulis", "MAO", "Bronduwst 2"]
    },
    {
        name: "OMAR AJI SAPUTRA",
        npm: "11122104",
        traits: ["pikun", "HP kecebur", "Benhil", "sigma", "predator", "indikasi LGBT", "kaum Nabi Luth"]
    },
    {
        name: "RAFI HANIFA FIKRI",
        npm: "11122147",
        traits: ["Unggr", "pemegang rezim", "Bowo versi lite", "toxic slayer", "KMC", "pemeran utama", "photo kita blur", "es krim Aice", "tumbler", "jaket legend", "helm", "Braven", "kacamata", "rambut M", "beradab", "mata 4", "admin Kaizen", "Terminator Salemba", "Batch 1 Gundar", "nakal"]
    },
    {
        name: "RATIH ANGGRAENI PUSPAWERDI",
        npm: "11122216",
        traits: ["Cakung", "tinggi", "perumahan elit", "suka nempel sama Andira"]
    },
    {
        name: "RIDHO SANTOSO",
        npm: "11122268",
        traits: ["admin", "leasing", "pohon beringin", "jorok", "sakit", "GU (Gila Urgensi)", "admin BTR", "banyak sahabat", "penunggu Johar", "admin Lagon", "tukang transit", "Ron 88", "Golda", "filter kretek", "Kangmus", "valet UGJ", "pidato"]
    },
    {
        name: "SALVIUS WILLYANDRA",
        npm: "11122343",
        traits: ["mau beli marga", "Medan", "cincin", "komandan", "ngabers", "founder Takosai", "Cibubur", "ojol anter jemput", "Bernadya 1 bulan", "Cina Wuhan", "kokoh", "juragan empang", "juragan ruko", "Batak", "Burger Bangor", "Cikande", "Ujung Kulon", "kecelakaan", "Anyer", "Tampubolon", "foto profil sosmed", "barista"]
    },
    {
        name: "THAFHAN AHSHA YATTAQI",
        npm: "11122430",
        traits: ["pria nonchalant", "D'Lion", "Bekasi", "dingin", "hafiz Qur'an", "monyet bersinar", "dibaca Topan"]
    },
    {
        name: "VONI FEBRIYANTI HELENA",
        npm: "11122463",
        traits: ["siap ndan", "semester 1", "kehujanan", "jatuh dari motor", "Roblox", "VD", "qbulei", "Max Verstappen", "Ferrari"]
    },
    {
        name: "WILDAN SUPRIATNA",
        npm: "11122471",
        traits: ["pengadegan Menara Saidah", "ogah pulang sadar", "populer (pokoknya pulang teler)", "BNN (Bagian Nuang Nuang)", "gak ketebak", "Vario jadul"]
    },
    {
        name: "ZINDANE KAORI",
        npm: "11122514",
        traits: ["yapping", "bengkok", "dinosaurus", "rambut Mail", "kurus", "pengkor", "cuti melahirkan", "duda", "Ancol", "Pademangan", "bandar", "populer", "baju putih", "vandalisme", "sakit (sange dikit)", "Amel", "wasit", "haji", "Jepang", "Malaysia", "kadal gurun", "Firaun"]
    }
];

function renderDeveloperTeam() {
    const galleryContainer = document.getElementById('developerGallery');
    if (galleryContainer) {
        // 31 photos from 6217594691956445154.jpg to 6217594691956445184.jpg
        const devPhotos = Array.from({length: 31}, (_, i) => `6217594691956445${154 + i}.jpg`);

        galleryContainer.innerHTML = devPhotos.map((filename, idx) => `
            <div class="group relative bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg hover:border-amber-500/25 transition duration-300 hover:-translate-y-1 aspect-square">
                <img src="assets/Tim Developer/${filename}" alt="Developer ${idx + 1}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500 ease-out" loading="lazy" />
            </div>
        `).join('');
    }

    filterDeveloperProfiles();
}

window.filterDeveloperProfiles = function() {
    const query = (document.getElementById('searchDevInput')?.value || '').trim().toLowerCase();
    const grid = document.getElementById('developerProfilesGrid');
    if (!grid) return;

    const filtered = developerProfiles.filter(dev => 
        dev.name.toLowerCase().includes(query) || 
        dev.npm.toLowerCase().includes(query) ||
        dev.traits.some(t => t.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12 text-slate-500 text-xs font-semibold">
                🔍 No developers match your search.
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(dev => {
        const traitsHtml = dev.traits.map(t => `
            <span class="px-2 py-0.5 bg-slate-900 border border-slate-800 text-[10px] text-slate-300 rounded-md font-semibold whitespace-nowrap hover:text-amber-400 hover:border-amber-500/20 transition duration-150">
                ${t}
            </span>
        `).join('');

        return `
            <div class="bg-slate-950/80 border border-slate-850 rounded-2xl p-5 hover:border-indigo-500/30 transition duration-300 flex flex-col justify-between hover:-translate-y-1 shadow-xl">
                <div class="space-y-2">
                    <div class="flex items-start justify-between gap-2">
                        <h4 class="text-xs md:text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-250 to-amber-500 leading-tight tracking-wide">${escapeHTML(dev.name)}</h4>
                        <span class="text-[9px] font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 whitespace-nowrap">${dev.npm}</span>
                    </div>
                </div>
                <div class="mt-4 pt-3 border-t border-slate-900 flex flex-wrap gap-1.5">
                    ${traitsHtml}
                </div>
            </div>
        `;
    }).join('');
};

window.loadGlobalLeaderboard = function () {
    const usersRef = ref(db, 'users');
    onValue(usersRef, (snapshot) => {
        const data = snapshot.val() || {};
        // Filter out guests (only keep registered users)
        const usersList = Object.values(data).filter(user => {
            return user && user.isGuest !== true && !user.username.startsWith("Guest_");
        });

        // Update Admin Users list if admin is logged in
        if (isAdmin) {
            const adminUsersContainer = document.getElementById('adminUsersList');
            if (adminUsersContainer) {
                const allUsers = Object.entries(data);
                if (allUsers.length === 0) {
                    adminUsersContainer.innerHTML = `
                        <div class="text-center py-4 text-slate-600 text-[10px] font-semibold">
                            No users found in database.
                        </div>
                    `;
                } else {
                    adminUsersContainer.innerHTML = allUsers.map(([uid, user]) => {
                        const isGuest = user.isGuest === true || user.username.startsWith("Guest_");
                        const userType = isGuest ? "Guest" : "Registered";
                        return `
                            <div class="flex justify-between items-center p-2 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-semibold text-slate-350 mb-1">
                                <div class="truncate max-w-[130px]">
                                    <span class="text-white font-bold">${escapeHTML(user.username)}</span>
                                    <span class="text-slate-500 block text-[8px] mt-0.5">${userType} | UID: ${uid.substring(0, 6)}...</span>
                                </div>
                                <button onclick="adminDeleteUser('${uid}', '${escapeHTML(user.username).replace(/'/g, "\\'")}')" class="bg-rose-500/20 hover:bg-rose-600 hover:text-white text-rose-400 px-2 py-1 rounded transition text-[9px] font-black">
                                    DELETE ❌
                                </button>
                            </div>
                        `;
                    }).join('');
                }
            }
        }
        
        usersList.sort((a, b) => {
            const scoreA = (a.stats && a.stats.totalScore) || 0;
            const scoreB = (b.stats && b.stats.totalScore) || 0;
            return scoreB - scoreA;
        });

        const top1 = usersList[0] || { username: "-", title: "-", stats: { totalScore: 0 } };
        const top2 = usersList[1] || { username: "-", title: "-", stats: { totalScore: 0 } };
        const top3 = usersList[2] || { username: "-", title: "-", stats: { totalScore: 0 } };

        document.getElementById('podium-1-name').innerText = top1.username || "-";
        document.getElementById('podium-1-title').innerText = (top1.title || "KA Novice").toUpperCase();
        document.getElementById('podium-1-score').innerText = `${(top1.stats && top1.stats.totalScore) || 0} Pts`;

        document.getElementById('podium-2-name').innerText = top2.username || "-";
        document.getElementById('podium-2-title').innerText = (top2.title || "KA Novice").toUpperCase();
        document.getElementById('podium-2-score').innerText = `${(top2.stats && top2.stats.totalScore) || 0} Pts`;

        document.getElementById('podium-3-name').innerText = top3.username || "-";
        document.getElementById('podium-3-title').innerText = (top3.title || "KA Novice").toUpperCase();
        document.getElementById('podium-3-score').innerText = `${(top3.stats && top3.stats.totalScore) || 0} Pts`;

        const tbody = document.getElementById('globalLeaderboardBody');
        if (!tbody) return;

        if (usersList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500 font-semibold">No leaderboard data available yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = usersList.map((user, idx) => {
            const matches = (user.stats && user.stats.matches) || 0;
            const wins = (user.stats && user.stats.wins) || 0;
            const score = (user.stats && user.stats.totalScore) || 0;
            const userAvatar = user.avatar || "🦁";
            const userTitle = user.title || "KA Novice";

            return `
                <tr class="hover:bg-slate-900/40 transition">
                    <td class="p-3 md:p-4 text-center font-bold text-slate-400">
                        ${idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                    </td>
                    <td class="p-3 md:p-4 flex items-center space-x-2.5">
                        <span class="text-base bg-slate-900 w-8 h-8 rounded-full border border-slate-800 flex items-center justify-center">${userAvatar}</span>
                        <div class="flex flex-col">
                            <span class="font-extrabold text-white leading-none">${escapeHTML(user.username)}</span>
                            <span class="text-[9px] text-amber-500/70 tracking-wider uppercase font-bold mt-0.5">${userTitle}</span>
                        </div>
                    </td>
                    <td class="p-3 md:p-4 text-center font-bold">${matches}</td>
                    <td class="p-3 md:p-4 text-center font-bold text-green-400">${wins}</td>
                    <td class="p-3 md:p-4 text-right font-black text-amber-400">${score} Pts</td>
                </tr>
            `;
        }).join('');
    });
};

window.renderProfileTab = function () {
    const avatarDisp = document.getElementById('profileAvatarDisplay');
    const userDisp = document.getElementById('profileUsernameDisplay');
    const titleDisp = document.getElementById('profileTitleDisplay');
    const matchesDisp = document.getElementById('statsMatches');
    const winsDisp = document.getElementById('statsWins');
    const scoreDisp = document.getElementById('statsTotalScore');
    const winRateDisp = document.getElementById('statsWinRate');

    if (avatarDisp) avatarDisp.innerText = myAvatar;
    if (userDisp) userDisp.innerText = myUsername;
    if (titleDisp) titleDisp.innerText = myTitle;
    applyTitleEffects(myTitle, 'profileAvatarDisplay', 'profileTitleDisplay');
    if (matchesDisp) matchesDisp.innerText = myStats.matches || 0;
    if (winsDisp) winsDisp.innerText = myStats.wins || 0;
    if (scoreDisp) scoreDisp.innerText = myStats.totalScore || 0;

    const matches = myStats.matches || 0;
    const wins = myStats.wins || 0;
    const rate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
    if (winRateDisp) winRateDisp.innerText = `${rate}%`;

    const inputName = document.getElementById('editUsernameInput');
    if (inputName && inputName.value === "") {
        inputName.value = myUsername;
    }

    const selectTitle = document.getElementById('editTitleSelect');
    if (selectTitle) {
        const totalScore = myStats.totalScore || 0;
        const winrate = matches > 0 ? (wins / matches) : 0;
        const isSpecialAdmin = (auth.currentUser && 
            (auth.currentUser.email === '1ka21.classs@gmail.com' || auth.currentUser.email === '1ka21.class@gmail.com'));

        const titles = [
            { name: "KA Novice", emoji: "🔰", reqs: null },
            { name: "Information Master", emoji: "💻", reqs: { matches: 5, score: 2000, winrate: 0.3 } },
            { name: "English Genius", emoji: "✍️", reqs: { matches: 10, score: 5000, winrate: 0.45 } },
            { name: "Clash Champion", emoji: "👑", reqs: { matches: 15, score: 10000, winrate: 0.6 } }
        ];

        selectTitle.innerHTML = titles.map(t => {
            if (!t.reqs) {
                return `<option value="${t.name}">${t.emoji} ${t.name}</option>`;
            }
            
            const isUnlocked = isSpecialAdmin || (matches >= t.reqs.matches && 
                               totalScore >= t.reqs.score && 
                               winrate >= t.reqs.winrate);
                               
            if (isUnlocked) {
                return `<option value="${t.name}">${t.emoji} ${t.name} (Unlocked)</option>`;
            } else {
                const wrPercent = Math.round(t.reqs.winrate * 100);
                return `<option value="${t.name}" disabled>${t.emoji} ${t.name} (LOCKED - Need: ${t.reqs.matches} Matches, ${wrPercent}% WR, ${t.reqs.score} Pts)</option>`;
            }
        }).join('');

        selectTitle.value = myTitle;
    }
};

window.updateProfileName = function () {
    const input = document.getElementById('editUsernameInput');
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) return alert("Nickname cannot be empty!");

    update(ref(db, `users/${myId}`), { username: newName })
        .then(() => {
            if (auth.currentUser) {
                updateProfile(auth.currentUser, { displayName: newName })
                    .then(() => {
                        alert("Username updated successfully!");
                    });
            } else {
                alert("Username updated successfully!");
            }
        })
        .catch(err => alert("Failed to change username: " + err.message));
};

window.selectAvatar = function (emoji) {
    update(ref(db, `users/${myId}`), { avatar: emoji })
        .then(() => {
            alert("Avatar changed successfully to " + emoji);
        })
        .catch(err => alert("Failed to change avatar: " + err.message));
};

window.updateProfileTitle = function () {
    const select = document.getElementById('editTitleSelect');
    if (!select) return;
    const newTitle = select.value;

    const matches = myStats.matches || 0;
    const wins = myStats.wins || 0;
    const totalScore = myStats.totalScore || 0;
    const winrate = matches > 0 ? (wins / matches) : 0;
    const isSpecialAdmin = (auth.currentUser && 
        (auth.currentUser.email === '1ka21.classs@gmail.com' || auth.currentUser.email === '1ka21.class@gmail.com'));

    const titleRequirements = {
        "KA Novice": null,
        "Information Master": { matches: 5, score: 2000, winrate: 0.3 },
        "English Genius": { matches: 10, score: 5000, winrate: 0.45 },
        "Clash Champion": { matches: 15, score: 10000, winrate: 0.6 }
    };

    const reqs = titleRequirements[newTitle];
    if (reqs && !isSpecialAdmin) {
        const isUnlocked = matches >= reqs.matches && 
                           totalScore >= reqs.score && 
                           winrate >= reqs.winrate;
        if (!isUnlocked) {
            const wrPercent = Math.round(reqs.winrate * 100);
            alert(`⚠️ TITLE LOCKED!\n\nYou do not meet the requirements to unlock the "${newTitle}" title.\n\nRequired Statistics:\n- Min Matches: ${reqs.matches} (You have: ${matches})\n- Min Winrate: ${wrPercent}% (You have: ${Math.round(winrate * 100)}%)\n- Min Cumulative Score: ${reqs.score} Pts (You have: ${totalScore} Pts)`);
            select.value = myTitle; // Reset selection
            return;
        }
    }

    update(ref(db, `users/${myId}`), { title: newTitle })
        .then(() => {
            alert("Profile title updated successfully!");
        })
        .catch(err => alert("Failed to change title: " + err.message));
};

window.confirmLogout = function () {
    if (confirm("Are you sure you want to log out?")) {
        console.log("Menjalankan signOut(auth)...");
        signOut(auth)
            .then(() => {
                console.log("signOut(auth) berhasil!");
            })
            .catch(err => {
                console.error("signOut(auth) gagal:", err);
                alert("Failed to Log Out: " + err.message);
            });
    }
};

window.leaveLobbyRoom = function () {
    if (confirm("Are you sure you want to leave this room?")) {
        if (currentRoomId && myId) {
            const playerRef = ref(db, `rooms/${currentRoomId}/players/${myId}`);
            set(playerRef, null).then(() => {
                const playersRef = ref(db, `rooms/${currentRoomId}/players`);
                onValue(playersRef, (snapshot) => {
                    const players = snapshot.val();
                    if (!players || Object.keys(players).length === 0) {
                        remove(ref(db, `rooms/${currentRoomId}`)).then(() => {
                            console.log(`Room ${currentRoomId} deleted from Firebase`);
                        });
                    }
                }, { onlyOnce: true });
                currentRoomId = "";
                document.getElementById('roomArea').classList.add('hidden');
                document.getElementById('lobby').classList.remove('hidden');
                
                const navTabs = document.getElementById('navTabs');
                if (navTabs) navTabs.classList.remove('pointer-events-none', 'opacity-50');
            });
        } else {
            currentRoomId = "";
            document.getElementById('roomArea').classList.add('hidden');
            document.getElementById('lobby').classList.remove('hidden');
            
            const navTabs = document.getElementById('navTabs');
            if (navTabs) navTabs.classList.remove('pointer-events-none', 'opacity-50');
        }
    }
};

// ==========================================
// 🛡️ SYSTEM ADMINISTRATOR CONTROLS
// ==========================================

window.adminResetLeaderboard = function () {
    if (!isAdmin) return alert("Unauthorized operation!");
    if (confirm("⚠️ WARNING!\nAre you sure you want to reset all user stats on the leaderboard to 0? This action is permanent and cannot be undone.")) {
        const usersRef = ref(db, 'users');
        get(usersRef).then((snapshot) => {
            const users = snapshot.val();
            if (!users) return alert("No user data found.");
            
            const updates = {};
            Object.keys(users).forEach(uid => {
                updates[`users/${uid}/stats`] = {
                    matches: 0,
                    wins: 0,
                    totalScore: 0
                };
            });
            
            update(ref(db), updates).then(() => {
                alert("Global leaderboard successfully reset to 0! 🔄");
            }).catch(err => {
                alert("Failed to reset leaderboard: " + err.message);
            });
        }).catch(err => {
            alert("Error loading users: " + err.message);
        });
    }
};

window.adminDeleteRoom = function (roomId) {
    if (!isAdmin) return alert("Unauthorized operation!");
    if (confirm(`Are you sure you want to delete Room ${roomId}? This will boot any active players.`)) {
        remove(ref(db, `rooms/${roomId}`)).then(() => {
            alert(`Room ${roomId} deleted successfully.`);
        }).catch(err => {
            alert("Failed to delete room: " + err.message);
        });
    }
};

window.adminDeleteUser = function (uid, username) {
    if (!isAdmin) return alert("Unauthorized operation!");
    if (confirm(`⚠️ WARNING!\nAre you sure you want to delete user profile "${username}"?`)) {
        remove(ref(db, `users/${uid}`)).then(() => {
            alert(`User "${username}" profile deleted successfully from the database.`);
        }).catch(err => {
            alert("Failed to delete user profile: " + err.message);
        });
    }
};

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

// Global click event listener for interactive sound elements
window.addEventListener('click', (e) => {
    const btn = e.target.closest('button, a, [role="button"], select');
    if (btn) {
        if (btn.id === 'btnSoundToggle') return;
        playGameSound('click');
    }
});