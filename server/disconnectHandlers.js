// Disconnect handlers for migoyugo
const { stopServerTimer } = require('./gameTimer');

// Handle socket disconnect
function handleDisconnect(socket, waitingPlayers, rooms, games, io) {
  return () => {
    console.log('User disconnected:', socket.id);
    
    // Remove from waiting players
    const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }
    
    // Handle room disconnection
    for (const [roomCode, room] of rooms.entries()) {
      if (room.host.id === socket.id) {
        // Host disconnected - notify guest and delete room
        if (room.guest) {
          room.guest.socket.emit('roomClosed', { message: 'Host disconnected' });
          room.guest.socket.leave(`room-${roomCode}`);
        }
        rooms.delete(roomCode);
        console.log(`Room ${roomCode} deleted - host disconnected`);
        break;
      } else if (room.guest && room.guest.id === socket.id) {
        // Guest disconnected - notify host and reset room
        room.guest = null;
        room.status = 'waiting';
        room.host.socket.emit('guestLeft', { roomCode, reason: 'disconnected' });
        console.log(`Guest disconnected from room ${roomCode}`);
        break;
      }
    }
    
    // Handle game disconnection
    for (const [gameId, game] of games.entries()) {
      if (game.players.white.id === socket.id || game.players.black.id === socket.id) {
        const disconnectedPlayerColor = game.players.white.id === socket.id ? 'white' : 'black';
        const winner = disconnectedPlayerColor === 'white' ? 'black' : 'white';
        
        // Track disconnect time for this player (in case of quick reconnect before game ends)
        if (game.gameStatus === 'active') {
          game.playerDisconnectTime = Date.now();
        }
        
        // Stop the game timer
        stopServerTimer(gameId, games);
        
        // End the game - disconnection = instant loss
        game.gameStatus = 'finished';
        const remainingPlayer = game.players.white.id === socket.id ?
          game.players.black.socket : game.players.white.socket;
          
        remainingPlayer.emit('gameEnd', {
          winner,
          reason: 'disconnection'
        });
        
        console.log(`Game ${gameId} ended - ${disconnectedPlayerColor} disconnected, ${winner} wins`);
        
        // Clean up associated room if game came from a room
        if (game.roomCode) {
          rooms.delete(game.roomCode);
          console.log(`Cleaned up room ${game.roomCode} after game ${gameId} ended`);
        }
        
        // Delete the game immediately
        games.delete(gameId);
        break;
      }
    }
  };
}

module.exports = {
  handleDisconnect
};
