// Test connection and rematch handlers for migoyugo
const { v4: uuidv4 } = require('uuid');
const { createEmptyBoard } = require('./gameLogic');
const { startServerTimer } = require('./gameTimer');

function resolvePlayerSocket(io, player) {
  if (!player) return null;

  const liveSocket = io.sockets.sockets.get(player.id);
  if (liveSocket) {
    player.id = liveSocket.id;
    player.socket = liveSocket;
    return liveSocket;
  }

  if (player.socket && player.socket.connected) {
    return player.socket;
  }

  return null;
}

// Test connection handler
function handleTestConnection(socket, games, io) {
  return (data) => {
    console.log(`\n=== TEST CONNECTION ===`);
    console.log(`Test connection received from ${socket.id}:`, data);
    console.log(`Socket rooms:`, Array.from(socket.rooms));
    console.log(`All connected sockets:`, Array.from(io.sockets.sockets.keys()));
    
    // Send back a response
    socket.emit('test-connection-response', {
      message: 'Test connection successful',
      serverSocketId: socket.id,
      timestamp: Date.now(),
      originalData: data
    });
    
    // If this is part of a game, check the opponent
    if (data.gameId) {
      const game = games.get(data.gameId);
      if (game) {
        console.log(`Game found for test - Status: ${game.gameStatus}`);
        console.log(`Game players:`, {
          white: { id: game.players.white.id, name: game.players.white.name },
          black: { id: game.players.black.id, name: game.players.black.name }
        });
        
        const playerColor = game.players.white.id === socket.id ? 'white' : 'black';
        const opponentColor = playerColor === 'white' ? 'black' : 'white';
        const opponentSocketId = game.players[opponentColor].id;
        
        console.log(`Opponent socket ID: ${opponentSocketId}`);
        const opponentSocket = io.sockets.sockets.get(opponentSocketId);
        if (opponentSocket) {
          console.log(`✓ Opponent socket found and connected: ${opponentSocket.connected}`);
          console.log(`Opponent socket rooms:`, Array.from(opponentSocket.rooms));
          
          // Send test message to opponent
          io.to(opponentSocketId).emit('test-connection-from-opponent', {
            message: `Test message from ${game.players[playerColor].name}`,
            from: playerColor,
            timestamp: Date.now()
          });
          console.log(`✓ Sent test message to opponent`);
        } else {
          console.log(`✗ Opponent socket ${opponentSocketId} not found!`);
        }
      } else {
        console.log(`✗ Game ${data.gameId} not found`);
      }
    }
    console.log(`=== END TEST CONNECTION ===\n`);
  };
}

// Request rematch handler
function handleRequestRematch(socket, games, io) {
  return ({ gameId }) => {
    console.log(`\n=== REMATCH REQUEST DEBUG ===`);
    console.log(`Rematch request received from ${socket.id} for game ${gameId}`);
    console.log(`Current games:`, Array.from(games.keys()));
    console.log(`Current connected sockets:`, Array.from(io.sockets.sockets.keys()));
    
    const game = games.get(gameId);
    
    if (!game) {
      console.log(`ERROR: Game ${gameId} not found in games map`);
      console.log(`Available games:`, Array.from(games.entries()).map(([id, g]) => ({
        id,
        status: g.gameStatus,
        players: { white: g.players.white.id, black: g.players.black.id }
      })));
      socket.emit('rematchRequestFailed', {
        gameId,
        reason: 'not_found',
        message: 'That game is no longer available for a rematch.'
      });
      return;
    }
    
    console.log(`Game found - Status: ${game.gameStatus}`);
    console.log(`Game players:`, {
      white: { id: game.players.white.id, name: game.players.white.name },
      black: { id: game.players.black.id, name: game.players.black.name }
    });
    
    if (game.gameStatus !== 'finished') {
      console.log(`ERROR: Game ${gameId} is not finished (status: ${game.gameStatus})`);
      socket.emit('rematchRequestFailed', {
        gameId,
        reason: 'not_finished',
        message: 'The game is still marked active; rematch is unavailable.'
      });
      return;
    }
    
    const playerColor = game.players.white.id === socket.id ? 'white' : 'black';
    const opponentColor = playerColor === 'white' ? 'black' : 'white';
    const opponentPlayer = game.players[opponentColor];
    const opponentSocketId = opponentPlayer?.id;
    
    console.log(`Player colors: ${playerColor} (${socket.id}) vs ${opponentColor} (${opponentSocketId})`);
    
    game.players[playerColor].id = socket.id;
    game.players[playerColor].socket = socket;

    // Check if opponent socket exists
    const opponentSocket = resolvePlayerSocket(io, opponentPlayer);
    if (opponentSocket) {
      console.log(`✓ Opponent socket found and connected: ${opponentSocket.connected}`);
      console.log(`Opponent socket rooms:`, Array.from(opponentSocket.rooms));
    } else {
      console.log(`✗ ERROR: Opponent socket ${opponentSocketId} not found!`);
      console.log(`Available sockets:`, Array.from(io.sockets.sockets.keys()));
      socket.emit('rematchRequestFailed', {
        gameId,
        reason: 'opponent_offline',
        message: 'Your opponent is no longer connected.'
      });
      return;
    }
    
    // Mark this player as requesting rematch
    if (!game.rematchRequests) {
      game.rematchRequests = {};
    }
    game.rematchRequests[playerColor] = true;
    
    console.log(`Sending rematch request to opponent ${opponentSocketId}...`);
    
    // Notify opponent about rematch request
    const rematchData = {
      gameId,
      requester: playerColor,
      requesterName: game.players[playerColor].name
    };
    console.log(`Rematch data:`, rematchData);
    
    opponentSocket.emit('rematchRequested', rematchData);
    console.log(`✓ Emitted rematchRequested event to ${opponentSocketId}`);
    
    // Notify requester that request was sent
    socket.emit('rematchRequestSent', { gameId });
    console.log(`✓ Sent confirmation to requester ${socket.id}`);
    console.log(`=== END REMATCH REQUEST DEBUG ===\n`);
  };
}

// Respond to rematch handler
function handleRespondToRematch(socket, games, io) {
  return ({ gameId, accept }) => {
    console.log(`Rematch response received from ${socket.id} for game ${gameId}: ${accept ? 'accepted' : 'declined'}`);
    const game = games.get(gameId);
    if (!game || game.gameStatus !== 'finished') {
      socket.emit('rematchRequestFailed', {
        gameId,
        reason: 'not_available',
        message: 'Rematch is no longer available for that game.'
      });
      return;
    }
    
    const playerColor = game.players.white.id === socket.id ? 'white' : 'black';
    const opponentColor = playerColor === 'white' ? 'black' : 'white';
    const requesterPlayer = game.players[opponentColor];
    const responderPlayer = game.players[playerColor];

    responderPlayer.id = socket.id;
    responderPlayer.socket = socket;

    const opponentSocket = resolvePlayerSocket(io, requesterPlayer);
    const responderSocket = resolvePlayerSocket(io, responderPlayer) || socket;
    
    if (accept) {
      if (!game.rematchRequests || !game.rematchRequests[opponentColor]) {
        console.log(`✗ No pending rematch request from ${opponentColor} for game ${gameId}`);
        socket.emit('rematchRequestFailed', {
          gameId,
          reason: 'no_request',
          message: 'No rematch request is waiting for your response.'
        });
        return;
      }

      if (!opponentSocket) {
        console.log(`✗ Unable to accept rematch - requester socket missing for game ${gameId}`);
        socket.emit('rematchRequestFailed', {
          gameId,
          reason: 'opponent_offline',
          message: 'Opponent is no longer connected.'
        });
        return;
      }

      // Both players agreed to rematch - create new game
      const newGameId = uuidv4();
      
      // Use same timer settings as original game
      const timerSettings = game.timerSettings || {
        timerEnabled: true,
        minutesPerPlayer: 10,
        incrementSeconds: 0
      };
      
      // Swap colors for the rematch
      const newGameState = {
        id: newGameId,
        players: {
          white: {
            id: opponentSocket.id,
            name: requesterPlayer.name,
            userId: requesterPlayer.userId,
            socket: opponentSocket
          },
          black: {
            id: responderSocket.id,
            name: responderPlayer.name,
            userId: responderPlayer.userId,
            socket: responderSocket
          }
        },
        board: createEmptyBoard(),
        currentPlayer: 'white',
        gameStatus: 'active',
        moveHistory: [],
        scores: { white: 0, black: 0 },
        lastMove: null,
        timerSettings: timerSettings,
        timers: {
          white: timerSettings.minutesPerPlayer * 60,
          black: timerSettings.minutesPerPlayer * 60
        },
        timerInterval: null,
        lastMoveTime: Date.now()
      };
      
      games.set(newGameId, newGameState);
      delete game.rematchRequests;
      games.delete(gameId);

      // Update socket rooms
      opponentSocket.leave(gameId);
      responderSocket.leave(gameId);
      opponentSocket.join(newGameId);
      responderSocket.join(newGameId);
      
      // Notify both players about new game
      const whitePlayerName = newGameState.players.white.name;
      const blackPlayerName = newGameState.players.black.name;
      
      opponentSocket.emit('rematchAccepted', {
        gameId: newGameId,
        playerColor: 'white',
        opponentName: blackPlayerName,
        gameState: {
          board: newGameState.board,
          currentPlayer: newGameState.currentPlayer,
          scores: newGameState.scores,
          players: {
            white: whitePlayerName,
            black: blackPlayerName
          }
        },
        timers: newGameState.timers
      });
      
      responderSocket.emit('rematchAccepted', {
        gameId: newGameId,
        playerColor: 'black',
        opponentName: whitePlayerName,
        gameState: {
          board: newGameState.board,
          currentPlayer: newGameState.currentPlayer,
          scores: newGameState.scores,
          players: {
            white: whitePlayerName,
            black: blackPlayerName
          }
        },
        timers: newGameState.timers
      });
      
      // Start server timer for new game
      if (timerSettings.timerEnabled) {
        startServerTimer(newGameId, games, io);
      }
      
    } else {
      // Rematch declined
      if (opponentSocket) {
        opponentSocket.emit('rematchDeclined', { gameId });
      }
      
      // Clean up rematch requests
      if (game.rematchRequests) {
        delete game.rematchRequests[opponentColor];
        delete game.rematchRequests[playerColor];
      }
    }
  };
}

module.exports = {
  handleTestConnection,
  handleRequestRematch,
  handleRespondToRematch
};
