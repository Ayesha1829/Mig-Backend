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
- `FRONTEND_URL` - Single frontend URL for CORS (e.g. `https://mig-frontend.vercel.app`). Used when `ALLOWED_ORIGINS` is not set.
- `ALLOWED_ORIGINS` - Optional comma-separated list of origins to allow for CORS/socket connections (e.g. `https://mig-frontend.vercel.app,http://localhost:3001`). If set, it takes precedence over `FRONTEND_URL`.
- `JWT_SECRET` - Secret used to sign JWT tokens (override for production)
- `ADMIN_PASSWORD` - Password protecting simple admin endpoints (override for production)

Note: By default the server includes `https://mig-frontend.vercel.app` in the fallback list so the Vercel-deployed frontend will be allowed even if you don't set these variables. For production you should explicitly set `ALLOWED_ORIGINS` or `FRONTEND_URL` and provide secure `JWT_SECRET` and `ADMIN_PASSWORD` values.

## Deployment

The server is configured for deployment on Railway, Heroku, or similar platforms.

If you're deploying the frontend to Vercel (for example at `https://mig-frontend.vercel.app`), make sure the backend allows that origin:

- Option A (recommended): Set `ALLOWED_ORIGINS` in your backend environment variables to include `https://mig-frontend.vercel.app` (can be a comma-separated list).
- Option B: Set `FRONTEND_URL=https://mig-frontend.vercel.app`.

Example (environment variables):

ALLOWED_ORIGINS=https://mig-frontend.vercel.app,http://localhost:3001
JWT_SECRET=<your-secret>
ADMIN_PASSWORD=<secure-password>

See `.env.example` for a starter template.

## License

MIT
