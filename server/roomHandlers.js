// Room-based multiplayer handlers for migoyugo
const { v4: uuidv4 } = require('uuid');
const { createEmptyBoard } = require('./gameLogic');
const { startServerTimer } = require('./gameTimer');

// Create room handler
function handleCreateRoom(socket, playerName, userId, rooms) {
  return () => {
    // Generate a 6-character room code
    let roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Ensure room code is unique
    while (rooms.has(roomCode)) {
      roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    
    const room = {
      code: roomCode,
      host: {
        id: socket.id,
        name: playerName,
        userId: userId,
        socket: socket
      },
      guest: null,
      gameId: null,
      status: 'waiting' // waiting, ready, active
    };
    
    rooms.set(roomCode, room);
    socket.join(`room-${roomCode}`);
    
    console.log(`Room ${roomCode} created by ${playerName}`);
    
    socket.emit('roomCreated', {
      roomCode,
      playerName,
      isHost: true
    });
  };
}

// Join room handler
function handleJoinRoom(socket, playerName, userId, rooms, io) {
  return ({ roomCode }) => {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
      socket.emit('roomError', { message: 'Room not found' });
      return;
    }
    
    if (room.status !== 'waiting') {
      socket.emit('roomError', { message: 'Room is not available' });
      return;
    }
    
    if (room.guest) {
      socket.emit('roomError', { message: 'Room is full' });
      return;
    }
    
    if (room.host.id === socket.id) {
      socket.emit('roomError', { message: 'Cannot join your own room' });
      return;
    }
    
    // Add guest to room
    room.guest = {
      id: socket.id,
      name: playerName,
      userId: userId,
      socket: socket
    };
    room.status = 'ready';
    
    socket.join(`room-${roomCode}`);
    
    console.log(`${playerName} joined room ${roomCode}`);
    
    // Notify both players
    io.to(`room-${roomCode}`).emit('roomJoined', {
      roomCode,
      host: { name: room.host.name, userId: room.host.userId },
      guest: { name: room.guest.name, userId: room.guest.userId },
      status: room.status
    });
  };
}

// Start room game handler
function handleStartRoomGame(socket, rooms, games, io) {
  return ({ roomCode }) => {
    const room = rooms.get(roomCode);
    
    if (!room || room.status !== 'ready') {
      socket.emit('roomError', { message: 'Room is not ready to start' });
      return;
    }
    
    if (room.host.id !== socket.id) {
      socket.emit('roomError', { message: 'Only the host can start the game' });
      return;
    }
    
    // Create game
    const gameId = uuidv4();
    
    const standardTimer = {
      timerEnabled: true,
      minutesPerPlayer: 10,
      incrementSeconds: 0
    };
    
    const gameState = {
      id: gameId,
      players: {
        white: room.host,
        black: room.guest
      },
      board: createEmptyBoard(),
      currentPlayer: 'white',
      gameStatus: 'active',
      moveHistory: [],
      scores: { white: 0, black: 0 },
      lastMove: null,
      timerSettings: standardTimer,
      timers: {
        white: standardTimer.minutesPerPlayer * 60,
        black: standardTimer.minutesPerPlayer * 60
      },
      timerInterval: null,
      lastMoveTime: Date.now(),
      roomCode: roomCode // Track which room this game came from
    };
    
    games.set(gameId, gameState);
    room.gameId = gameId;
    room.status = 'active';
    
    // Move players from room to game room
    room.host.socket.leave(`room-${roomCode}`);
    room.guest.socket.leave(`room-${roomCode}`);
    room.host.socket.join(gameId);
    room.guest.socket.join(gameId);
    
    console.log(`Game ${gameId} started from room ${roomCode}`);
    
    // Notify both players
    room.host.socket.emit('gameStart', {
      gameId,
      playerColor: 'white',
      opponentName: room.guest.name,
      timerSettings: standardTimer,
      gameState: {
        board: gameState.board,
        currentPlayer: gameState.currentPlayer,
        scores: gameState.scores,
        players: {
          white: room.host.name,
          black: room.guest.name
        }
      },
      timers: gameState.timers,
      fromRoom: true
    });
    
    room.guest.socket.emit('gameStart', {
      gameId,
      playerColor: 'black',
      opponentName: room.host.name,
      timerSettings: standardTimer,
      gameState: {
        board: gameState.board,
        currentPlayer: gameState.currentPlayer,
        scores: gameState.scores,
        players: {
          white: room.host.name,
          black: room.guest.name
        }
      },
      timers: gameState.timers,
      fromRoom: true
    });
    
    // Start server-side timer
    if (standardTimer.timerEnabled) {
      startServerTimer(gameId, games, io);
    }
  };
}

// Leave room handler
function handleLeaveRoom(socket, rooms) {
  return ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    socket.leave(`room-${roomCode}`);
    
    
    if (room.host.id === socket.id) {
      // Host is leaving - notify guest and delete room
      if (room.guest) {
        room.guest.socket.emit('roomClosed', { message: 'Host left the room' });
        room.guest.socket.leave(`room-${roomCode}`);
      }
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} closed - host left`);
    } else if (room.guest && room.guest.id === socket.id) {
      // Guest is leaving - notify host and reset room
      room.guest = null;
      room.status = 'waiting';
      room.host.socket.emit('guestLeft', { roomCode });
      console.log(`Guest left room ${roomCode}`);
    }
  };
}

module.exports = {
  handleCreateRoom,
  handleJoinRoom,
  handleStartRoomGame,
  handleLeaveRoom
};
