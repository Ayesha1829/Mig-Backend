// Game logic functions for migoyugo
const { v4: uuidv4 } = require('uuid');

// Game logic functions
function createEmptyBoard() {
  return Array(8).fill(null).map(() => Array(8).fill(null));
}



function isValidMove(board, row, col, playerColor) {
  if (row < 0 || row >= 8 || col < 0 || col >= 8) return false;
  if (board[row][col] !== null) return false;
  
  // Check if move would create a line too long
  return !wouldCreateLineTooLong(board, row, col, playerColor);
}

function wouldCreateLineTooLong(board, row, col, playerColor) {
  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];



  for (const [dr, dc] of directions) {
    let count = 1;
    
    // Count in positive direction
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && 
           board[r][c] && board[r][c].color === playerColor) {
      count++;
      r += dr;
      c += dc;
    }
    // Count in negative direction
    
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && 
           board[r][c] && board[r][c].color === playerColor) {
      count++;
      r -= dr;
      c -= dc;
    }


    
    if (count > 4) return true;
  }
  
  return false;
}

function checkForYugos(board, row, col, playerColor) {
  const directions = [
    [-1, 0],  // up
    [-1, 1],  // up-right diagonal  
    [0, 1],   // right
    [1, 1]    // down-right diagonal
  ];
  
  const yugos = [];
  
  for (const [dr, dc] of directions) {
    const line = [{row, col}];
    
    // Collect in positive direction
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && 
           board[r][c] && board[r][c].color === playerColor) {
      line.push({row: r, col: c});
      r += dr;
      c += dc;
    }
    
    // Collect in negative direction
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && 
           board[r][c] && board[r][c].color === playerColor) {
      line.unshift({row: r, col: c});
      r -= dr;
      c -= dc;
    }
    
    if (line.length === 4) {
      yugos.push(line);
    }
  }
  
  return yugos;
}

function processYugos(board, yugos, row, col) {
  if (yugos.length === 0) return { yugoType: null, removedCells: [] };
  
  const removedCells = [];
  
  //remove 
  // Remove ions from yugos (except yugos and the new placement)
  yugos.forEach(yugo => {
    yugo.forEach(cell => {
      if (!(cell.row === row && cell.col === col) && 
          board[cell.row][cell.col] && 
          !board[cell.row][cell.col].isYugo) {
        removedCells.push({row: cell.row, col: cell.col});
        board[cell.row][cell.col] = null;
      }
    });
  });
  
  // Determine yugo type based on number of yugos
  let yugoType = 'standard';
  if (yugos.length === 2) yugoType = 'double';
  else if (yugos.length === 3) yugoType = 'triple';
  else if (yugos.length === 4) yugoType = 'quadruple';
  
  return { yugoType, removedCells };
}

function checkForIgo(board, row, col, playerColor) {
  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];
  
  for (const [dr, dc] of directions) {
    const line = [{row, col}];
    
    // Collect in positive direction
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && 
           board[r][c] && board[r][c].isYugo && board[r][c].color === playerColor) {
      line.push({row: r, col: c});
      r += dr;
      c += dc;
    }
    
    // Collect in negative direction
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && 
           board[r][c] && board[r][c].isYugo && board[r][c].color === playerColor) {
      line.unshift({row: r, col: c});
      r -= dr;
      c -= dc;
    }
    
    
    if (line.length === 4) {
      return line;
    }
  }
  
  return null;
}

function hasLegalMoves(board, playerColor) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (isValidMove(board, row, col, playerColor)) {
        return true;
      }
    }
  }
  return false;
}

function countYugos(board, playerColor) {
  let count = 0;
  console.log(`DEBUG SERVER: Counting yugos for ${playerColor}`);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = board[row][col];
      if (cell && cell.isYugo && cell.color === playerColor) {
        // Count yugo value based on its type
        let yugoValue = 1; // default
        switch (cell.yugoType) {
          case 'standard':
            yugoValue = 1;
            break;
          case 'double':
            yugoValue = 2;
            break;
          case 'triple':
            yugoValue = 3;
            break;
          case 'quadruple':
            yugoValue = 4;
            break;
          
          default:
            yugoValue = 1; // fallback for yugos without yugoType so that it will explain at its own value 
        }
        console.log(`DEBUG SERVER: Yugo at ${row},${col} type=${cell.yugoType} value=${yugoValue}`);
        count += yugoValue;
      }
    }
  }
  console.log(`DEBUG SERVER: Total count for ${playerColor}: ${count}`);
  return count;
}

module.exports = {
  createEmptyBoard,
  isValidMove,
  wouldCreateLineTooLong,
  checkForYugos,
  processYugos,
  checkForIgo,
  hasLegalMoves,
  countYugos
};
