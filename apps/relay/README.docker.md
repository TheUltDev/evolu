# Evolu Relay - Docker Setup

Docker configuration for the Evolu Relay supporting both development and production deployments.

## 🚀 Quick Start for Developers

**Just one command to get started:**

```bash
cd apps/relay
pnpm docker:up
```

That's it! This will:

- ✅ Automatically build the Docker image
- ✅ Start the Evolu Relay service
- ✅ Show real-time logs
- ✅ Make the service available at `http://localhost:4000`

Press `Ctrl+C` to stop the service.

## 🏗️ Development vs Production

Evolu Relay provides two Docker configurations optimized for different use cases:

| Feature | Development (`Dockerfile`) | Production (`Dockerfile.prod`) |
|---------|---------------------------|-------------------------------|
| **Source** | Local monorepo | NPM packages |
| **Build Time** | ~2-3 minutes | ~1-2 minutes |
| **Image Size** | ~300-400 MB | ~150-200 MB |
| **Updates** | Local code changes | NPM package versions |
| **Use Case** | Development, testing | Production deployment |
| **Layer Caching** | Good | Excellent |
| **Dependencies** | Builds from source | Pre-built packages |

### When to Use Which?

**Use Development (`Dockerfile`):**
- You're actively developing the relay
- Testing local changes
- Need full monorepo context
- Debugging issues

**Use Production (`Dockerfile.prod`):**
- Deploying to production
- Using published packages
- Want minimal image size
- Need faster builds
- Deploying to cloud platforms

### Background Mode (Optional)

**Development:**

```bash
cd apps/relay

# Start in background
pnpm docker:up:detached

# View logs when needed
pnpm docker:logs

# Stop when done
pnpm docker:down
```

**Production:**

```bash
cd apps/relay

# Start production build in background
pnpm docker:prod:up:detached

# View logs
pnpm docker:prod:logs

# Stop when done
pnpm docker:prod:down
```

## 🔧 Advanced Usage

### Development Commands

| Command                   | Description                                    | Auto-builds? | Persistence  |
| ------------------------- | ---------------------------------------------- | ------------ | ------------ |
| `pnpm docker:up`          | **Recommended**: Start in foreground with logs | ✅ Yes       | Named volume |
| `pnpm docker:up:detached` | Start in background                            | ✅ Yes       | Named volume |
| `pnpm docker:down`        | Stop services                                  | N/A          | N/A          |
| `pnpm docker:restart`     | Restart with rebuild                           | ✅ Yes       | Named volume |
| `pnpm docker:logs`        | View logs (live)                               | N/A          | N/A          |
| `pnpm docker:shell`       | Access running container shell                 | N/A          | N/A          |
| `pnpm docker:stats`       | View container resource usage                  | N/A          | N/A          |
| `pnpm docker:inspect`     | View container details                         | N/A          | N/A          |
| `pnpm docker:build`       | Build image only                               | N/A          | N/A          |
| `pnpm docker:clean`       | Clean up containers and images                 | N/A          | N/A          |
| `pnpm docker:clean:all`   | **Full cleanup**: Remove everything            | N/A          | N/A          |

### Production Commands

| Command                         | Description                                    |
| ------------------------------- | ---------------------------------------------- |
| `pnpm docker:prod:build`        | Build production image from NPM packages       |
| `pnpm docker:prod:up`           | Start production containers with logs          |
| `pnpm docker:prod:up:detached`  | Start production in background                 |
| `pnpm docker:prod:down`         | Stop production containers                     |
| `pnpm docker:prod:logs`         | View production logs (live)                    |
| `pnpm docker:prod:shell`        | Access production container shell              |
| `pnpm docker:prod:test`         | Run automated production image tests           |

### Manual Docker Commands (Alternative)

**Development Build:**

```bash
# Build manually
docker-compose build

# Run with Docker Compose
docker-compose up --build

# Run directly with Docker
docker run -p 4000:4000 evolu/relay:dev
```

**Production Build:**

```bash
# Build production image
docker build -f Dockerfile.prod -t evolu-relay:prod .

# Run with Docker Compose
docker-compose -f docker-compose.prod.yml up --build

# Run directly with Docker
docker run -p 4000:4000 evolu-relay:prod

# Pull from Docker Hub
docker pull evoluhq/relay:latest
docker run -p 4000:4000 evoluhq/relay:latest
```

### Version Pinning (Production)

Pin specific NPM package versions for stability:

**Using build arguments:**

```bash
docker build -f Dockerfile.prod \
  --build-arg EVOLU_COMMON_VERSION=6.0.1-preview.19 \
  --build-arg EVOLU_NODEJS_VERSION=1.0.1-preview.7 \
  -t evolu-relay:stable .
```

**Using .env file with Docker Compose:**

Create `apps/relay/.env`:

```env
EVOLU_COMMON_VERSION=6.0.1-preview.19
EVOLU_NODEJS_VERSION=1.0.1-preview.7
NODE_VERSION=22-alpine
```

Then run:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## ❓ FAQ

**Q: Do I need to build the image first?**  
A: No! `pnpm docker:up` automatically builds and starts everything.

**Q: How do I update after code changes?**  
A: For development: `pnpm docker:restart`. For production: rebuild with `pnpm docker:prod:up --build`.

**Q: What's the difference between dev and prod builds?**  
A: Development builds from local monorepo source, production pulls published NPM packages. Production is smaller and faster.

**Q: How do I use a specific package version?**  
A: Create a `.env` file with `EVOLU_COMMON_VERSION` and `EVOLU_NODEJS_VERSION`, then use `docker-compose.prod.yml`.

**Q: How do I know if it's working?**  
A: Check `http://localhost:4000` - you should get a "426 Upgrade Required" response (this is correct for WebSocket servers).

**Q: How do I see what's happening?**  
A: Use `pnpm docker:logs` (dev) or `pnpm docker:prod:logs` (prod) to view live logs.

**Q: How do I access the container?**  
A: Use `pnpm docker:shell` (dev) or `pnpm docker:prod:shell` (prod) to get shell access inside the running container.

**Q: How do I clean up everything?**  
A: Run `pnpm docker:clean:all` to remove all containers, images, and networks.

**Q: Can I run both dev and prod at the same time?**  
A: Yes, but they use different ports by default. Modify port mappings in the compose files if needed.

## 📁 Docker Files

| File | Purpose | Use Case |
|------|---------|----------|
| `Dockerfile` | Development build from monorepo | Local development, testing |
| `Dockerfile.prod` | Production build from NPM packages | Production deployment |
| `docker-compose.yml` | Development orchestration | Local development |
| `docker-compose.prod.yml` | Production orchestration | Production deployment |
| `.dockerignore` | Build context exclusions | Faster builds |

## ⚙️ Configuration

### Development Configuration

- **Port**: 4000 (modify in `docker-compose.yml` if needed)
- **Environment**: `NODE_ENV=production` in Docker
- **Health Check**: Built-in health monitoring via Docker Compose
- **Data Persistence**: SQLite database automatically persists via Docker volumes
- **Container Name**: `evolu-relay-server`
- **Image Name**: `evolu/relay:dev`

### Production Configuration

- **Port**: 4000 (configurable via `PORT` env var)
- **Environment**: Configurable via `.env` file
- **Health Check**: Built-in health monitoring
- **Data Persistence**: Named volume `evolu-relay-prod-data`
- **Container Name**: `evolu-relay-production`
- **Image Name**: `evoluhq/relay:latest` or `evoluhq/relay:prod`

### Environment Variables

Create an `.env` file in the relay directory:

```env
# Package versions (for building)
EVOLU_COMMON_VERSION=latest
EVOLU_NODEJS_VERSION=latest
NODE_VERSION=22-alpine

# Runtime configuration
PORT=4000
LOG_LEVEL=info
NODE_ENV=production
TZ=UTC

# Resource limits
MEMORY_LIMIT=1G
CPU_LIMIT=1.0
MEMORY_RESERVED=512M
CPU_RESERVED=0.5

# Logging
LOG_MAX_SIZE=50m
LOG_MAX_FILES=5
```

### Container Details

**Development:**

| Component          | Value                 | Description                        |
| ------------------ | --------------------- | ---------------------------------- |
| **Container Name** | `evolu-relay-server`  | Easy identification                |
| **Image Name**     | `evolu/relay:dev`     | Tagged for development             |
| **Network**        | `evolu-relay-network` | Isolated Docker network            |
| **Volume**         | `evolu-relay-data`    | Persistent SQLite database storage |
| **User**           | `evolu:nodejs` (1001) | Non-root user for security         |
| **Memory Limit**   | 1GB (configurable)    | Resource constraint                |
| **CPU Limit**      | 1.0 (configurable)    | CPU resource constraint            |

**Production:**

| Component          | Value                      | Description                        |
| ------------------ | -------------------------- | ---------------------------------- |
| **Container Name** | `evolu-relay-production`   | Easy identification                |
| **Image Name**     | `evoluhq/relay:latest`     | Tagged for production deployment   |
| **Network**        | `evolu-prod-network`       | Isolated Docker network            |
| **Volume**         | `evolu-relay-prod-data`    | Persistent SQLite database storage |
| **User**           | `evolu:nodejs` (1001)      | Non-root user for security         |
| **Memory Limit**   | 1GB (configurable)         | Resource constraint                |
| **CPU Limit**      | 1.0 (configurable)         | CPU resource constraint            |

## 🚨 Troubleshooting

| Issue                    | Solution                                                   |
| ------------------------ | ---------------------------------------------------------- |
| Build fails              | Run `pnpm docker:clean:all` and try again                  |
| Port already in use      | Change port in compose file or stop other services         |
| Container won't start    | Check logs with `pnpm docker:logs` or `pnpm docker:prod:logs` |
| Need container access    | Use `pnpm docker:shell` or `pnpm docker:prod:shell`        |
| Performance issues       | Check resources with `docker stats`                        |
| Need to reset everything | Run `pnpm docker:clean:all`                                |
| Package version issues   | Pin versions in `.env` file for production builds          |
| Image size too large     | Use production build (`Dockerfile.prod`)                   |

## 📚 Additional Resources

- **[Production Deployment Guide](./docs/PRODUCTION.md)** - Comprehensive guide for production deployments
- **[Main README](./README.md)** - Overview and quick start
- **[Docker Hub](https://hub.docker.com/r/evoluhq/relay)** - Pre-built images
- **[GitHub Actions](.github/workflows/docker.yaml)** - CI/CD configuration

## 🔍 Monitoring & Debugging

### Real-time Monitoring

**Development:**

```bash
# View live logs
pnpm docker:logs

# Monitor resource usage
pnpm docker:stats

# Container details
pnpm docker:inspect

# Access container shell
pnpm docker:shell
```

**Production:**

```bash
# View live logs
pnpm docker:prod:logs

# Access container shell
pnpm docker:prod:shell

# Check health status
docker inspect --format='{{.State.Health.Status}}' evolu-relay-production
```

### Inside Container Commands

```bash
# Access container (dev)
pnpm docker:shell

# Access container (prod)
pnpm docker:prod:shell

# Then inside container:
ls -la /app/data/                   # View database files
cat package.json                    # View package info
cat node_modules/@evolu/common/package.json  # Check package versions
ps aux                              # Check running processes
top                                 # Monitor resource usage
netstat -tlnp                       # Check port bindings
```

## 🧪 Testing Production Image

Run the automated test suite to verify the production image:

```bash
cd apps/relay
pnpm docker:prod:test
```

This will verify:
- ✅ Image builds successfully
- ✅ Image size is reasonable
- ✅ Container starts correctly
- ✅ Service responds to requests
- ✅ Health checks pass
- ✅ Security configuration (non-root user)
- ✅ Package versions are correct

## 🚀 CI/CD Integration

The project includes GitHub Actions workflows that automatically build and push Docker images:

### Automatic Builds

On every push to `main` branch:
- **Development build**: `evoluhq/relay:dev`
- **Production build**: `evoluhq/relay:latest`, `evoluhq/relay:prod`, `evoluhq/relay:<version>`

Both images support:
- Multi-platform (linux/amd64, linux/arm64)
- Build provenance attestation
- SBOM (Software Bill of Materials)
- Layer caching via GitHub Actions cache

### Manual Workflow Trigger

You can manually trigger builds from GitHub Actions:
1. Go to Actions tab
2. Select "DockerHub" workflow
3. Click "Run workflow"
4. Choose branch and run

## 🌐 Using Pre-built Images

Production images are automatically published to Docker Hub:

```bash
# Pull latest production image
docker pull evoluhq/relay:latest

# Pull specific version
docker pull evoluhq/relay:1.1.1

# Pull production tag
docker pull evoluhq/relay:prod

# Pull development tag
docker pull evoluhq/relay:dev
```
