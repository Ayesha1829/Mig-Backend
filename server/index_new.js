// Load environment variables
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Import authentication modules
const { initializeDatabase, createUser, getUserByEmail, getUserByUsername, verifyPassword, getUserStats, getAllUsers, getSystemStats, getRecentUsers, getTopPlayers } = require('./database');
const { generateToken, authenticateToken } = require('./auth');

// Import game modules
const { handleFindMatch, handleMakeMove, handleCancelMatchmaking, handleRequestTimerSync, handleResign } = require('./socketHandlers');
const { handleDrawOffer, handleDrawAccept, handleDrawDecline } = require('./drawHandlers');
const { handleCreateRoom, handleJoinRoom, handleStartRoomGame, handleLeaveRoom } = require('./roomHandlers');
const { handleTestConnection, handleRequestRematch, handleRespondToRematch } = require('./testAndRematchHandlers');
const { handleDisconnect } = require('./disconnectHandlers');

const app = express();
const server = http.createServer(app);
// Parse CORS origins from environment variables.
// Supports ALLOWED_ORIGINS (comma separated) or single FRONTEND_URL / PRODUCTION_FRONTEND_URL.
// If none provided, fall back to a sensible default list (including the Vercel frontend URL).
const parseCorsOrigins = () => {
  const env = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || process.env.PRODUCTION_FRONTEND_URL;
  const defaults = [
    "http://localhost:3001",
    "http://195.35.2.209:3001",
    "http://195.35.2.209:3002",
    "https://mig-frontend.vercel.app"
  ];
  if (!env) return defaults;

  // Allow comma-separated lists in ALLOWED_ORIGINS
  const arr = env.split(',').map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : defaults;
};

const allowedOrigins = parseCorsOrigins().map(o => o.replace(/\/$/, '')); // normalize (no trailing slash)

const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      // allow non-browser clients or same-origin requests without origin
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, '');
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3002;

// Log environment info for debugging
console.log('=== ENVIRONMENT INFO ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', PORT);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('PRODUCTION_FRONTEND_URL:', process.env.PRODUCTION_FRONTEND_URL);
console.log('CORS_ORIGINS:', allowedOrigins);
console.log('========================');

// Initialize database
initializeDatabase().catch(console.error);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // allow non-browser clients (curl, Postman) or requests without origin
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(normalized)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// Serve static files from React build (commented out since client is in separate repo)
// app.use(express.static(path.join(__dirname, '../client/build')));

// Authentication routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    // Validate input
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Validate username
    const usernameRegex = /^[a-zA-Z][a-zA-Z0-9]{5,19}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ error: 'Username must be 6-20 characters, start with a letter, and contain only letters and numbers' });
    }
    
    // Validate password
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character' });
    }
    
    // Check if user already exists
    const existingUserByEmail = await getUserByEmail(email);
    if (existingUserByEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const existingUserByUsername = await getUserByUsername(username);
    if (existingUserByUsername) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    
    
    // Create user
    const user = await createUser(email, username, password);
    const token = generateToken(user);
    
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws
      },
      token
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Get user by email
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Generate token
    const token = generateToken(user);
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws
      },
      token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Protected route example - get user profile
app.get('/api/auth/profile', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      username: req.user.username,
      wins: req.user.wins,
      losses: req.user.losses,
      draws: req.user.draws,
      created_at: req.user.created_at
    }
  });
});

// Get user statistics
app.get('/api/auth/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await getUserStats(req.user.id);
    if (!stats) {
      return res.status(404).json({ error: 'User stats not found' });
    }
    res.json({ stats });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin routes - Simple password protection
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'migoyugo-admin-2024';

function adminAuth(req, res, next) {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  next();
}

// Admin dashboard - Get all users
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin dashboard - Get system statistics  
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const stats = await getSystemStats();
    res.json({ stats });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin dashboard - Get recent users
app.get('/api/admin/recent-users', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const users = await getRecentUsers(limit);
    res.json({ users });
  } catch (error) {
    console.error('Admin recent users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin dashboard - Get top players
app.get('/api/admin/top-players', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const players = await getTopPlayers(limit);
    res.json({ players });
  } catch (error) {
    console.error('Admin top players error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin dashboard - Serve admin panel HTML (must be before catch-all)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Catch all handler: send back React's index.html file for any non-API routes
// Commented out since client is in separate repo
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
// });

// Simple catch-all for non-API routes (since client is in separate repo)
app.get('*', (req, res) => {
  res.json({ 
    message: 'Migoyugo Game Server API', 
    status: 'running',
    note: 'Client is running in separate repository'
  });
});

// Game state management
const games = new Map();
const waitingPlayers = [];
const rooms = new Map(); // Room management: roomCode -> { host, guest, gameId, status }

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Get user info from auth data
  const authData = socket.handshake.auth;
  let playerName = '';
  let userId = null;
  let isGuest = false;  // ADD THIS LINE
  
  if (authData.isGuest) {
    playerName = `Guest${Math.floor(Math.random() * 9000) + 1000}`;
    isGuest = true;  // ADD THIS LINE
  } else if (authData.user && authData.user.username) {
    playerName = authData.user.username;
    userId = authData.user.id;
  } else {
    playerName = `Player${Math.floor(Math.random() * 9000) + 1000}`;
  }
  
  console.log(`${playerName} connected ${authData.isGuest ? '(guest)' : '(authenticated)'}`);

  // Set up all socket event handlers
  socket.on('findMatch', handleFindMatch(socket, playerName, userId, isGuest, waitingPlayers, games, io));
  socket.on('makeMove', handleMakeMove(socket, games, io));
  socket.on('cancelMatchmaking', handleCancelMatchmaking(socket, waitingPlayers));
  socket.on('requestTimerSync', handleRequestTimerSync(socket, games));
  socket.on('resign', handleResign(socket, games, io));
  
  // Draw handlers
  socket.on('draw-offer', handleDrawOffer(socket, games, io));
  socket.on('draw-accept', handleDrawAccept(socket, games, io));
  socket.on('draw-decline', handleDrawDecline(socket, games, io));
  
  // Room handlers
  socket.on('createRoom', handleCreateRoom(socket, playerName, userId, rooms));
  socket.on('joinRoom', handleJoinRoom(socket, playerName, userId, rooms, io));
  socket.on('startRoomGame', handleStartRoomGame(socket, rooms, games, io));
  socket.on('leaveRoom', handleLeaveRoom(socket, rooms));
  
  // Test and rematch handlers
  socket.on('test-connection', handleTestConnection(socket, games, io));
  socket.on('requestRematch', handleRequestRematch(socket, games, io));
  socket.on('respondToRematch', handleRespondToRematch(socket, games, io));
  
  // Disconnect handler
  socket.on('disconnect', handleDisconnect(socket, waitingPlayers, rooms, games, io));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
