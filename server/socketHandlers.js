// Socket.IO event handlers for migoyugo
const { v4: uuidv4 } = require('uuid');
const { createEmptyBoard, isValidMove, checkForYugos, processYugos, checkForIgo, hasLegalMoves, countYugos } = require('./gameLogic');
const { startServerTimer, stopServerTimer, addTimeIncrement } = require('./gameTimer');

// Game matchmaking handlers
function handleFindMatch(socket, playerName, userId, isGuest, waitingPlayers, games, io) {
  return (timerSettings) => {
    const playerId = socket.id;
    
    // Use standard timer settings for all online games
    const standardTimer = {
      timerEnabled: true,
      minutesPerPlayer: 10,
      incrementSeconds: 0
    };
    
    console.log(`Player ${playerName} (${isGuest ? 'guest' : 'member'}) looking for match with timer:`, standardTimer);
    
    // Find a matching opponent with the same guest/member status
    const opponentIndex = waitingPlayers.findIndex(p => p.isGuest === isGuest);
    
    if (opponentIndex !== -1) {
      // Match with waiting player of same type
      const opponent = waitingPlayers.splice(opponentIndex, 1)[0];
      const gameId = uuidv4();
      
      const gameState = {
        id: gameId,
        players: {
          white: { id: opponent.id, name: opponent.name, userId: opponent.userId, socket: opponent.socket },
          black: { id: playerId, name: playerName, userId: userId, socket: socket }
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
        lastMoveTime: Date.now()
      };
      
      games.set(gameId, gameState);
      
      // Join both players to game room
      socket.join(gameId);
      opponent.socket.join(gameId);
      
      // Notify both players
      opponent.socket.emit('gameStart', {
        gameId,
        playerColor: 'white',
        opponentName: playerName,
        timerSettings: standardTimer,
        gameState: {
          board: gameState.board,
          currentPlayer: gameState.currentPlayer,
          scores: gameState.scores,
          players: {
            white: opponent.name,
            black: playerName
          }
        },
        timers: gameState.timers,
        timestamp: Date.now()
      });
      
      socket.emit('gameStart', {
        gameId,
        playerColor: 'black',
        opponentName: opponent.name,
        timerSettings: standardTimer,
        gameState: {
          board: gameState.board,
          currentPlayer: gameState.currentPlayer,
          scores: gameState.scores,
          players: {
            white: opponent.name,
            black: playerName
          }
        },
        timers: gameState.timers,
        timestamp: Date.now()
      });
      
      // Start server-side timer
      if (standardTimer.timerEnabled) {
        startServerTimer(gameId, games, io);
      }
      
    } else {
      // Add to waiting list
      waitingPlayers.push({ id: playerId, name: playerName, userId: userId, isGuest: isGuest, socket });
      socket.emit('waitingForOpponent');
    }
  };
}

// Game move handler
function handleMakeMove(socket, games, io) {
  return ({ gameId, row, col }) => {
    const game = games.get(gameId);
    if (!game || game.gameStatus !== 'active') return;
    
    const playerColor = game.players.white.id === socket.id ? 'white' : 'black';
    if (game.currentPlayer !== playerColor) {
      socket.emit('moveError', { message: 'Not your turn', gameId });
      return;
    }
    
    if (!isValidMove(game.board, row, col, playerColor)) {
      // Emit error to the player who made the invalid move
      socket.emit('moveError', { 
        message: 'Illegal move. You may not create a line longer than 4 of your own color',
        row,
        col,
        gameId
      });
      return;
    }
    
    // Place the migo
    game.board[row][col] = { color: playerColor, isYugo: false };
    
    // Check for yugos
    const yugos = checkForYugos(game.board, row, col, playerColor);
    const { yugoType, removedCells } = processYugos(game.board, yugos, row, col);
    
    // If yugos were formed, make this cell a yugo
    if (yugoType) {
      game.board[row][col] = { color: playerColor, isYugo: true, yugoType };
      // Recalculate scores for both players (yugo formation can affect both)
      game.scores.white = countYugos(game.board, 'white');
      game.scores.black = countYugos(game.board, 'black');
    }
    
    // Check for igo (winning condition)
    const igo = checkForIgo(game.board, row, col, playerColor);
    let gameOver = false;
    let winner = null;
    
    if (igo) {
      gameOver = true;
      winner = playerColor;
      game.gameStatus = 'finished';
    } else {
      // Switch players
      game.currentPlayer = game.currentPlayer === 'white' ? 'black' : 'white';
      
      // Check if next player has legal moves
      if (!hasLegalMoves(game.board, game.currentPlayer)) {
        gameOver = true;
        const whiteYugos = countYugos(game.board, 'white');
        const blackYugos = countYugos(game.board, 'black');
         if (whiteYugos > blackYugos) winner = 'white';
        else if (blackYugos > whiteYugos) winner = 'black';
        else winner = 'draw';
        
        game.gameStatus = 'finished';
      }
    }
    
    game.lastMove = { row, col, player: playerColor };
    game.moveHistory.push({ row, col, player: playerColor, yugos: yugos.length });
    
    // Add time increment for the player who just moved
    addTimeIncrement(gameId, games);
    
    // Stop timer if game is over, otherwise restart for next player
    if (gameOver) {
      stopServerTimer(gameId, games);
    } else if (game.timerSettings.timerEnabled) {
      // Restart timer for the new current player (not a reconnection)
      startServerTimer(gameId, games, io, false);
    }
    
    // Broadcast move to both players
    const moveData = {
      row,
      col,
      player: playerColor,
      yugos: yugos.length,
      yugoType,
      removedCells,
      board: game.board,
      currentPlayer: game.currentPlayer,
      scores: game.scores,
      gameOver,
      winner,
      igo,
      timers: game.timers,
      timestamp: Date.now()
    };
    
    io.to(gameId).emit('moveUpdate', moveData);
    
    // Immediately emit timerUpdate after moveUpdate to ensure sync
    // This helps clients catch up if they missed any timerUpdate events
    if (game.timerSettings.timerEnabled && !gameOver) {
      io.to(gameId).emit('timerUpdate', {
        timers: { ...game.timers },
        activeTimer: game.currentPlayer,
        timestamp: Date.now()
      });
    }
  };
}

// Cancel matchmaking handler
function handleCancelMatchmaking(socket, waitingPlayers) {
  return () => {
    const index = waitingPlayers.findIndex(p => p.id === socket.id);
    if (index !== -1) {
      waitingPlayers.splice(index, 1);
    }
  };
}

// Timer sync handler
function handleRequestTimerSync(socket, games, io) {
  return ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) return;
    
    console.log(`Timer sync requested for game ${gameId}`);
    
    // If timer is not running, restart it (this handles reconnection case)
    if (game.timerSettings.timerEnabled && !game.timerInterval) {
      startServerTimer(gameId, games, io, true); // true = reconnection
    }
    
    // Send current timer state with timestamp
    const now = Date.now();
    socket.emit('timerSync', {
      timers: { ...game.timers },
      activeTimer: game.currentPlayer,
      timestamp: now
    });
    
    // Also send timerUpdate immediately to ensure sync
    socket.emit('timerUpdate', {
      timers: { ...game.timers },
      activeTimer: game.currentPlayer,
      timestamp: now
    });
  };
}

// Reset game handler
function handleResetGame(socket, games, io) {
  return ({ gameId, reason = 'playerReset' }) => {
    const game = games.get(gameId);
    if (!game) return;

    const isWhite = game.players.white.id === socket.id;
    const isBlack = game.players.black.id === socket.id;
    if (!isWhite && !isBlack) {
      socket.emit('gameError', { message: 'Cannot reset a game you are not part of', gameId });
      return;
    }

    const requestedBy = isWhite ? 'white' : 'black';

    stopServerTimer(gameId, games);
    game.gameStatus = 'finished';

    io.to(gameId).emit('gameReset', {
      gameId,
      reason,
      requestedBy,
      timers: { ...game.timers }
    });

    io.in(gameId).socketsLeave(gameId);
    games.delete(gameId);
  };
}

// Resign handler
function handleResign(socket, games, io) {
  return ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) return;
    
    const playerColor = game.players.white.id === socket.id ? 'white' : 'black';
    const winner = playerColor === 'white' ? 'black' : 'white';
    
    game.gameStatus = 'finished';
    stopServerTimer(gameId, games);
    
    io.to(gameId).emit('gameEnd', {
      winner,
      reason: 'resignation'
    });
  };
}

module.exports = {
  handleFindMatch,
  handleMakeMove,
  handleCancelMatchmaking,
  handleRequestTimerSync,
  handleResetGame,
  handleResign
};
