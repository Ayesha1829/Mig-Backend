// Draw offer handlers for migoyugo
const { stopServerTimer } = require('./gameTimer');

// Draw offer handler
function handleDrawOffer(socket, games, io) {
  return ({ gameId }) => {
    const game = games.get(gameId);
    if (!game || game.gameStatus !== 'active') return;
    
    const playerColor = game.players.white.id === socket.id ? 'white' : 'black';
    const opponentColor = playerColor === 'white' ? 'black' : 'white';
    const opponentSocketId = game.players[opponentColor].id;
    
    // Send draw offer to opponent
    io.to(opponentSocketId).emit('drawOffered', {
      gameId,
      fromPlayer: playerColor,
      fromPlayerName: game.players[playerColor].name
    });
  };
}

// Draw accept handler
function handleDrawAccept(socket, games, io) {
  return ({ gameId }) => {
    const game = games.get(gameId);
    if (!game || game.gameStatus !== 'active') return;
    
    game.gameStatus = 'finished';
    stopServerTimer(gameId, games);
    
    // Notify both players that the game ended in a draw
    io.to(gameId).emit('drawAccepted');
    io.to(gameId).emit('gameEnd', {
      winner: null,
      reason: 'draw'
    });
  };
}

// Draw decline handler
function handleDrawDecline(socket, games, io) {
  return ({ gameId }) => {
    const game = games.get(gameId);
    if (!game || game.gameStatus !== 'active') return;
    
    const playerColor = game.players.white.id === socket.id ? 'white' : 'black';
    const opponentColor = playerColor === 'white' ? 'black' : 'white';
    const opponentSocketId = game.players[opponentColor].id;
    
    // Notify the player who offered the draw that it was declined
    io.to(opponentSocketId).emit('drawDeclined');
  };
}

module.exports = {
  handleDrawOffer,
  handleDrawAccept,
  handleDrawDecline
};
