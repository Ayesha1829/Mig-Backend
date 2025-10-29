# Migoyugo Game - Backend Server

This is the backend server for the Migoyugo game, built with Node.js, Express, and Socket.IO.

## Features

- Real-time multiplayer gameplay with Socket.IO
- User authentication and JWT tokens
- Game room management
- Matchmaking system
- Game state synchronization
- SQLite database for user data and game history

## Getting Started

### Prerequisites

- Node.js (v22 or higher)
- npm (v9 or higher)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/corextechnologies/migoyugo-B.git
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
PORT=3002
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
```

### Running the Server

The server runs on port 3002 by default:

```bash
# Production
npm start

# Development (with auto-restart)
npm run dev
```

The server will be available at `http://localhost:3002`

## API Endpoints

- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User registration
- `GET /api/auth/profile` - Get user profile
- `GET /api/auth/stats` - Get user statistics
- `GET /api/auth/users` - Get all users (admin)

## Socket.IO Events

### Client to Server
- `find-match` - Start matchmaking
- `make-move` - Make a game move
- `create-room` - Create a game room
- `join-room` - Join a game room
- `request-rematch` - Request a rematch
- `draw-offer` - Offer a draw
- `resign` - Resign from game

### Server to Client
- `game-start` - Game has started
- `move-made` - Opponent made a move
- `game-end` - Game has ended
- `room-created` - Room was created
- `room-joined` - Player joined room

## Database

The server uses SQLite for data persistence:
- User accounts and authentication
- Game history and statistics
- Room management

## Environment Variables

- `PORT` - Server port (default: 3002)
- `NODE_ENV` - Environment (development/production)
- `FRONTEND_URL` - Frontend URL for CORS (default: http://localhost:3001)

## Deployment

The server is configured for deployment on Railway, Heroku, or similar platforms.

## License

MIT
