// Game timer functions for migoyugo

function startServerTimer(gameId, games, io, isReconnection = false) {
  const game = games.get(gameId);
  if (!game || !game.timerSettings.timerEnabled) return;
  
  console.log(`Starting server timer for game ${gameId}${isReconnection ? ' (reconnection)' : ''}`);
  
  // Clear any existing timer
  if (game.timerInterval) {
    clearInterval(game.timerInterval);
  }
  
  // Only adjust for elapsed time on reconnection, not on normal turn switches
  // When restarting after a move, the interval was already decrementing correctly
  // and we just need to account for any small gap between clearing and restarting
  const now = Date.now();
  if (isReconnection && game.lastMoveTime) {
    // Check if we have disconnect time (more accurate than lastMoveTime)
    let disconnectTime = game.lastMoveTime;
    if (game.playerDisconnectTime) {
      disconnectTime = game.playerDisconnectTime;
    }
    
    const elapsedSeconds = Math.floor((now - disconnectTime) / 1000);
    // Remove the 600 second cap - allow full elapsed time calculation
    if (elapsedSeconds > 0) {
      const currentPlayer = game.currentPlayer;
      const timeToSubtract = Math.min(elapsedSeconds, game.timers[currentPlayer]);
      game.timers[currentPlayer] = Math.max(0, game.timers[currentPlayer] - timeToSubtract);
      console.log(`Adjusted timer for ${currentPlayer} by ${timeToSubtract} seconds during reconnection (was disconnected for ${elapsedSeconds}s)`);
      
      // Clear disconnect time after using it
      if (game.playerDisconnectTime) {
        delete game.playerDisconnectTime;
      }
      
      // Broadcast updated timer immediately so clients see accurate time
      io.to(gameId).emit('timerUpdate', {
        timers: { ...game.timers },
        activeTimer: currentPlayer,
        timestamp: now
      });
    }
  } else if (game.lastMoveTime && !isReconnection) {
    // On normal turn switch, account for small gap between clearing interval and restarting
    // This is typically < 1 second, but we should still account for it
    const elapsedSeconds = Math.floor((now - game.lastMoveTime) / 1000);
    if (elapsedSeconds > 0 && elapsedSeconds <= 2) { // Only small gaps (0-2 seconds)
      // The previous player's timer was running, so we need to know who that was
      // Since we just switched, previous player is the opposite of current
      const previousPlayer = game.currentPlayer === 'white' ? 'black' : 'white';
      game.timers[previousPlayer] = Math.max(0, game.timers[previousPlayer] - elapsedSeconds);
      console.log(`Adjusted timer for ${previousPlayer} by ${elapsedSeconds} seconds for gap between timer restart`);
    }
  }
  
  game.timerInterval = setInterval(() => {
    if (game.gameStatus !== 'active') {
      clearInterval(game.timerInterval);
      return;
    }
    
    const currentPlayer = game.currentPlayer;
    game.timers[currentPlayer] -= 1;
    
    // Broadcast timer update to all players
    // Use volatile emit to prevent buffering in deployment
    io.to(gameId).volatile.emit('timerUpdate', {
      timers: { ...game.timers },
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
