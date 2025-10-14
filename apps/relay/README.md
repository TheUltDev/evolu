# Evolu Relay

A WebSocket relay server for the Evolu database system that enables real-time synchronization between clients.

## 🚀 Quick Start

### Docker Development (Recommended)

```bash
cd apps/relay
pnpm docker:up
```

### Production Deployment

**Using Pre-built Docker Image (Recommended):**

```bash
docker pull evoluhq/relay:latest
docker run -d -p 4000:4000 -v evolu-relay-data:/app/data evoluhq/relay:latest
```

**Using Docker Compose:**

```bash
cd apps/relay
pnpm docker:prod:up
```

The relay will be available at `http://localhost:4000` (Docker) or your server's IP:4000 (production)

📚 **See [Production Deployment Guide](./docs/PRODUCTION.md) for comprehensive deployment instructions.**

## 📖 Documentation

- **[Docker Setup](./README.docker.md)** - Docker development and testing guide
- **[Production Deployment](./docs/PRODUCTION.md)** - Comprehensive production deployment guide

## 🔧 Development

### Local Development (Node.js)

```bash
pnpm dev    # Start with file watching
pnpm build  # Build TypeScript
pnpm start  # Start built application
```

### Docker Development

```bash
pnpm docker:up           # Start with logs
pnpm docker:up:detached  # Start in background
pnpm docker:down         # Stop containers
pnpm docker:logs         # View logs
pnpm docker:shell        # Access container shell
pnpm docker:clean        # Clean up everything
```

## 🛠️ Available Commands

### Development

| Command      | Description                                 |
| ------------ | ------------------------------------------- |
| `pnpm dev`   | Start development server with file watching |
| `pnpm build` | Build TypeScript to JavaScript              |
| `pnpm start` | Start the built application                 |
| `pnpm clean` | Clean build artifacts                       |

### Docker - Development

| Command                   | Description                          |
| ------------------------- | ------------------------------------ |
| `pnpm docker:up`          | Build and start containers with logs |
| `pnpm docker:up:detached` | Start containers in background       |
| `pnpm docker:down`        | Stop all containers                  |
| `pnpm docker:restart`     | Restart containers with rebuild      |
| `pnpm docker:logs`        | View container logs                  |
| `pnpm docker:shell`       | Access running container shell       |
| `pnpm docker:stats`       | View container resource usage        |
| `pnpm docker:clean`       | Remove containers and cleanup        |

### Docker - Production

| Command                       | Description                              |
| ----------------------------- | ---------------------------------------- |
| `pnpm docker:prod:build`      | Build production image from NPM packages |
| `pnpm docker:prod:up`         | Start production containers with logs    |
| `pnpm docker:prod:up:detached`| Start production in background           |
| `pnpm docker:prod:down`       | Stop production containers               |
| `pnpm docker:prod:logs`       | View production container logs           |
| `pnpm docker:prod:shell`      | Access production container shell        |
| `pnpm docker:prod:test`       | Run automated production image tests     |

## 📋 Requirements

- **Node.js** ≥22.0.0
- **Docker** (for containerized development/deployment)
- **pnpm** (workspace package manager)

## 🔗 Integration

After deployment, your Evolu applications can connect to the relay:

**Development**: `ws://localhost:4000`  
**Production**: `ws://your-server-ip:4000`

The relay handles WebSocket connections and data synchronization across all connected Evolu applications.

---

📚 **Quick Links**:

- [Docker Setup Guide](./README.docker.md) - Local development and testing
- [Production Deployment Guide](./docs/PRODUCTION.md) - Comprehensive production deployment
