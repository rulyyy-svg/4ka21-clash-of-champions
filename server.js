const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

// 🎯 BANK SOAL GLOBAL
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

// 🪜 PETA KOTAK ULAR TANGGA (Max Kotak 30)
const boardModifiers = {
    3: 22, 5: 8, 11: 26, 20: 29, // Tangga (Naik)
    17: 4, 19: 7, 21: 9, 27: 1   // Ular (Turun)
};

let rooms = {};

io.on('connection', (socket) => {
    console.log(`User terhubung: ${socket.id}`);

    // 🏠 CREATE ROOM
    socket.on('createRoom', ({ username, mode }) => {
        if (!username) return socket.emit('errorMsg', 'Username wajib diisi!');
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            id: roomId,
            mode: mode,
            players: [],
            currentRound: 0,
            isPlaying: false,
            timer: 20,
            currentTurnIdx: 0,
            activeAnswer: "",
            countdownInterval: null
        };
        joinRoomLogic(socket, roomId, username);
    });

    // 🏠 JOIN ROOM
    socket.on('joinRoom', ({ roomId, username }) => {
        if (!username) return socket.emit('errorMsg', 'Username wajib diisi!');
        roomId = roomId.toUpperCase();
        if (!rooms[roomId]) return socket.emit('errorMsg', 'Room tidak ditemukan!');
        if (rooms[roomId].players.length >= 8) return socket.emit('errorMsg', 'Room sudah penuh!');
        if (rooms[roomId].isPlaying) return socket.emit('errorMsg', 'Game sedang berjalan!');
        joinRoomLogic(socket, roomId, username);
    });

    function joinRoomLogic(socket, roomId, username) {
        socket.join(roomId);
        rooms[roomId].players.push({
            id: socket.id,
            username: username,
            score: 0,
            position: 1, // Untuk mode ular tangga
            hasAnswered: false
        });
        io.to(roomId).emit('roomUpdate', rooms[roomId]);
    }

    // 🎮 START GAME
    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (room && !room.isPlaying) {
            room.isPlaying = true;
            nextRound(roomId);
        }
    });

    // ⏱️ LOGIKA RONDE & TIMER (Pemisah Mode Kompetisi vs Ular Tangga)
    function nextRound(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        if (room.countdownInterval) clearInterval(room.countdownInterval);

        // 🎲 SPESIFIK: MODE ULAR TANGGA
        if (room.mode === 'snakes') {
            if (room.currentRound === 0) {
                room.players.forEach(p => p.position = 1);
                room.currentTurnIdx = 0;
            }

            const activePlayer = room.players[room.currentTurnIdx];
            // Ambil soal acak dari bank soal scramble
            const randomQuiz = gameQuestions.scramble[Math.floor(Math.random() * gameQuestions.scramble.length)];
            
            room.timer = 20;
            room.activeAnswer = randomQuiz.answer;

            io.to(roomId).emit('snakesRound', {
                turnPlayerId: activePlayer.id,
                turnPlayerName: activePlayer.username,
                question: randomQuiz.quiz,
                players: room.players,
                timer: room.timer
            });

            room.countdownInterval = setInterval(() => {
                room.timer--;
                io.to(roomId).emit('timerUpdate', room.timer);

                if (room.timer <= 0) {
                    clearInterval(room.countdownInterval);
                    io.to(roomId).emit('snakesResult', { 
                        username: activePlayer.username, 
                        success: false, 
                        dice: 0, 
                        msg: `Waktu Habis! Kunci jawaban: ${room.activeAnswer}` 
                    });
                    setTimeout(() => switchTurn(roomId), 4000);
                }
            }, 1000);
            return;
        }

        // 🌟 MODE REGULAR (Scramble, Picture, Sentence, Quiz)
        const modeQuestions = gameQuestions[room.mode];
        if (room.currentRound >= modeQuestions.length) {
            io.to(roomId).emit('gameOver', room.players.sort((a, b) => b.score - a.score));
            delete rooms[roomId];
            return;
        }

        const currentQuestion = modeQuestions[room.currentRound];
        room.timer = 20;
        room.players.forEach(p => p.hasAnswered = false);

        io.to(roomId).emit('newRound', {
            question: currentQuestion.quiz,
            options: currentQuestion.options || null,
            round: room.currentRound + 1,
            timer: room.timer
        });

        room.countdownInterval = setInterval(() => {
            room.timer--;
            io.to(roomId).emit('timerUpdate', room.timer);

            if (room.timer <= 0 || room.players.every(p => p.hasAnswered)) {
                clearInterval(room.countdownInterval);
                room.currentRound++;
                io.to(roomId).emit('roundEnded', { answer: currentQuestion.answer, players: room.players });
                setTimeout(() => nextRound(roomId), 4000);
            }
        }, 1000);
    }

    // 🎯 SUBMIT JAWABAN MODE REGULAR
    socket.on('submitAnswer', ({ roomId, answer }) => {
        const room = rooms[roomId];
        if (!room || room.mode === 'snakes') return;

        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.hasAnswered) {
            player.hasAnswered = true;
            const currentQuestion = gameQuestions[room.mode][room.currentRound];
            
            if (answer.trim().toLowerCase() === currentQuestion.answer.toLowerCase()) {
                player.score += 50 + (room.timer * 10); // Skor Kecepatan + Ketepatan
            }
            io.to(roomId).emit('playerAnswered', room.players);
        }
    });

    // 🎯 SUBMIT JAWABAN MODE ULAR TANGGA
    socket.on('submitSnakesAnswer', ({ roomId, answer }) => {
        const room = rooms[roomId];
        if (!room || room.mode !== 'snakes') return;

        const activePlayer = room.players[room.currentTurnIdx];
        if (socket.id !== activePlayer.id) return;

        clearInterval(room.countdownInterval);

        if (answer.trim().toLowerCase() === room.activeAnswer.toLowerCase()) {
            const diceRoll = Math.floor(Math.random() * 6) + 1;
            let oldPos = activePlayer.position;
            let newPos = oldPos + diceRoll;

            if (newPos > 30) newPos = 30;

            let bonusMsg = "";
            if (boardModifiers[newPos]) {
                let finalPos = boardModifiers[newPos];
                bonusMsg = finalPos > newPos ? " 🪜 Naik Tangga!" : " 🐍 Digigit Ular!";
                newPos = finalPos;
            }

            activePlayer.position = newPos;
            activePlayer.score += 100;

            io.to(roomId).emit('snakesResult', {
                username: activePlayer.username,
                success: true,
                dice: diceRoll,
                msg: `Benar! Dadu dapet ${diceRoll}.${bonusMsg}`,
                players: room.players
            });

            if (newPos >= 30) {
                io.to(roomId).emit('gameOver', room.players.sort((a, b) => b.score - a.score));
                delete rooms[roomId];
                return;
            }
        } else {
            io.to(roomId).emit('snakesResult', {
                username: activePlayer.username,
                success: false,
                dice: 0,
                msg: `Jawaban Salah! Kunci: ${room.activeAnswer}`
            });
        }

        setTimeout(() => switchTurn(roomId), 4000);
    });

    function switchTurn(roomId) {
        const room = rooms[roomId];
        if (!room) return;
        room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
        room.currentRound++;
        nextRound(roomId);
    }

    // 🔌 PLAYER DISCONNECT
    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                if (rooms[roomId].countdownInterval) clearInterval(rooms[roomId].countdownInterval);
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('roomUpdate', rooms[roomId]);
            }
        }
    });
});

server.listen(3000, () => console.log('Aplikasi berjalan di http://localhost:3000'));