// Game timer functions for migoyugo

function startServerTimer(gameId, games, io) {
  const game = games.get(gameId);
  if (!game || !game.timerSettings.timerEnabled) return;
  
  console.log(`Starting server timer for game ${gameId}`);
  
  // Clear any existing timer
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
  }
  
  game.timerInterval = setInterval(() => {
    if (game.gameStatus !== 'active') {
      clearInterval(game.timerInterval);
      return;
    }
    
    const currentPlayer = game.currentPlayer;
    game.timers[currentPlayer] -= 1;
    
    // Broadcast timer update to all players
    io.to(gameId).emit('timerUpdate', {
      timers: game.timers,
      activeTimer: currentPlayer,
      timestamp: Date.now()
    });
    
    // Check for timeout
    if (game.timers[currentPlayer] <= 0) {
      const winner = currentPlayer === 'white' ? 'black' : 'white';
      game.gameStatus = 'finished';
      clearInterval(game.timerInterval);
      
      io.to(gameId).emit('gameEnd', {
        winner,
        reason: 'timeout',
        timers: game.timers
      });
    }
  }, 1000);
  game.lastMoveTime = Date.now();
  
}

function stopServerTimer(gameId, games) {
  const game = games.get(gameId);
  if (game && game.timerInterval) {
    clearInterval(game.timerInterval);
    game.timerInterval = null;
    console.log(`Stopped server timer for game ${gameId}`);
  }
}


function addTimeIncrement(gameId, games) {
  const game = games.get(gameId);
  if (!game || !game.timerSettings.timerEnabled || game.timerSettings.incrementSeconds === 0) return;
  
  const currentPlayer = game.currentPlayer === 'white' ? 'black' : 'white'; // Previous player gets increment
  game.timers[currentPlayer] += game.timerSettings.incrementSeconds;
  
  console.log(`Added ${game.timerSettings.incrementSeconds}s increment to ${currentPlayer} in game ${gameId}`);
}

module.exports = {
  startServerTimer,
  stopServerTimer,
  addTimeIncrement
};
