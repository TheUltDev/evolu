# Evolu Relay - Production Deployment Guide

This guide covers production deployment of the Evolu Relay server using Docker containers with published NPM packages.

## Table of Contents

- [Quick Start](#quick-start)
- [Deployment Options](#deployment-options)
- [Docker Images](#docker-images)
- [Environment Variables](#environment-variables)
- [Version Management](#version-management)
- [Deployment Platforms](#deployment-platforms)
- [Monitoring & Troubleshooting](#monitoring--troubleshooting)
- [Scaling](#scaling)
- [Security](#security)
- [Backup & Recovery](#backup--recovery)

## Quick Start

### Using Pre-built Image from Docker Hub

```bash
# Pull the latest production image
docker pull evoluhq/relay:latest

# Run the container
docker run -d \
  --name evolu-relay \
  -p 4000:4000 \
  -v evolu-relay-data:/app/data \
  --restart unless-stopped \
  evoluhq/relay:latest
```

### Using Docker Compose (Production)

```bash
cd apps/relay
docker-compose -f docker-compose.prod.yml up -d
```

## Deployment Options

### Option 1: Pre-built Docker Hub Image (Recommended)

**Best for:** Production deployments, CI/CD pipelines

```bash
# Latest production release
docker pull evoluhq/relay:latest

# Specific version
docker pull evoluhq/relay:1.1.1

# Production tag
docker pull evoluhq/relay:prod
```

**Pros:**
- No build time required
- Tested and verified images
- Multi-platform support (amd64, arm64)
- Automatic updates available

### Option 2: Build from Production Dockerfile

**Best for:** Custom configurations, version pinning

```bash
cd apps/relay

# Build with latest NPM packages
docker build -f Dockerfile.prod -t evolu-relay:custom .

# Build with specific versions
docker build -f Dockerfile.prod \
  --build-arg EVOLU_COMMON_VERSION=6.0.1-preview.19 \
  --build-arg EVOLU_NODEJS_VERSION=1.0.1-preview.7 \
  -t evolu-relay:custom .
```

**Pros:**
- Pin specific package versions
- Custom build arguments
- Full control over the build process

### Option 3: Development Build from Monorepo

**Best for:** Development, testing, local modifications

```bash
cd apps/relay
pnpm docker:up
```

**Pros:**
- Builds from local source
- Includes local changes
- Better for development workflow

## Docker Images

### Available Tags

| Tag | Description | Use Case | Auto-updated |
|-----|-------------|----------|--------------|
| `latest` | Latest production release | Production | ✅ On main push |
| `prod` | Production build | Production | ✅ On main push |
| `dev` | Development build | Development/Testing | ✅ On main push |
| `1.1.1` | Specific version | Production (pinned) | ❌ Fixed version |
| `main-prod` | Latest main branch (prod) | Staging | ✅ On commits |

### Image Sizes

| Build Type | Approximate Size | Notes |
|------------|-----------------|-------|
| Production (`Dockerfile.prod`) | ~150-200 MB | NPM packages only |
| Development (`Dockerfile`) | ~300-400 MB | Full monorepo build |

## Environment Variables

### Core Configuration

```bash
# Node environment (production recommended)
NODE_ENV=production

# Logging level: error, warn, info, debug
LOG_LEVEL=info

# Timezone for logs
TZ=UTC

# Port (default: 4000)
PORT=4000
```

### Docker Compose Variables

Create a `.env` file in the relay directory:

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

## Version Management

### Pinning Package Versions

For production stability, pin specific versions:

```bash
# Using Docker build arguments
docker build -f Dockerfile.prod \
  --build-arg EVOLU_COMMON_VERSION=6.0.1-preview.19 \
  --build-arg EVOLU_NODEJS_VERSION=1.0.1-preview.7 \
  -t evolu-relay:stable .
```

Using `.env` with Docker Compose:

```env
EVOLU_COMMON_VERSION=6.0.1-preview.19
EVOLU_NODEJS_VERSION=1.0.1-preview.7
```

### Checking Installed Versions

```bash
# View package versions in running container
docker exec evolu-relay-production sh -c \
  "cat node_modules/@evolu/common/package.json | grep version"

docker exec evolu-relay-production sh -c \
  "cat node_modules/@evolu/nodejs/package.json | grep version"
```

### Upgrading

1. **Check for updates:**
   ```bash
   npm view @evolu/common version
   npm view @evolu/nodejs version
   ```

2. **Update environment:**
   ```env
   EVOLU_COMMON_VERSION=<new-version>
   EVOLU_NODEJS_VERSION=<new-version>
   ```

3. **Rebuild and restart:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d --build
   ```

## Deployment Platforms

### Render.com

The project includes `render.yaml` for easy deployment:

```yaml
services:
  - type: web
    runtime: image
    image:
      url: evoluhq/relay:latest
```

Deploy steps:
1. Create account at render.com
2. Connect your repository
3. Create new Web Service
4. Select "Use render.yaml"
5. Deploy

### AWS ECS / Fargate

```bash
# Push to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com

docker tag evoluhq/relay:latest <account>.dkr.ecr.us-east-1.amazonaws.com/evolu-relay:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/evolu-relay:latest

# Create ECS task definition and service using the pushed image
```

### Google Cloud Run

```bash
# Tag for GCR
docker tag evoluhq/relay:latest gcr.io/<project-id>/evolu-relay:latest

# Push to GCR
docker push gcr.io/<project-id>/evolu-relay:latest

# Deploy to Cloud Run
gcloud run deploy evolu-relay \
  --image gcr.io/<project-id>/evolu-relay:latest \
  --platform managed \
  --region us-central1 \
  --port 4000
```

### DigitalOcean App Platform

Use the Docker Hub image directly:
1. Create new app
2. Select Docker Hub as source
3. Image: `evoluhq/relay:latest`
4. Port: 4000
5. Add persistent volume at `/app/data`

### Kubernetes

Example deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: evolu-relay
spec:
  replicas: 3
  selector:
    matchLabels:
      app: evolu-relay
  template:
    metadata:
      labels:
        app: evolu-relay
    spec:
      containers:
      - name: relay
        image: evoluhq/relay:latest
        ports:
        - containerPort: 4000
        env:
        - name: NODE_ENV
          value: "production"
        volumeMounts:
        - name: data
          mountPath: /app/data
        resources:
          limits:
            memory: "1Gi"
            cpu: "1000m"
          requests:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 30
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: evolu-relay-pvc
```

## Monitoring & Troubleshooting

### Health Checks

The production image includes built-in health checks:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' evolu-relay-production

# View health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' evolu-relay-production
```

### Viewing Logs

```bash
# Follow logs
docker logs -f evolu-relay-production

# Last 100 lines
docker logs --tail 100 evolu-relay-production

# Logs with timestamps
docker logs -t evolu-relay-production
```

### Resource Monitoring

```bash
# Real-time stats
docker stats evolu-relay-production

# Detailed inspection
docker inspect evolu-relay-production
```

### Common Issues

#### Container won't start

```bash
# Check logs
docker logs evolu-relay-production

# Check if port is already in use
netstat -tuln | grep 4000

# Try different port
docker run -p 4001:4000 evoluhq/relay:latest
```

#### High memory usage

Adjust resource limits in `docker-compose.prod.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 2G
```

#### Database locked errors

Ensure proper volume mounting and single instance:

```bash
# Stop all instances
docker-compose -f docker-compose.prod.yml down

# Clean up volumes if needed
docker volume rm evolu-relay-prod-data

# Restart
docker-compose -f docker-compose.prod.yml up -d
```

## Scaling

### Horizontal Scaling

**Note:** SQLite is not designed for horizontal scaling. For multi-instance deployments, consider:

1. **Load balancing with sticky sessions**
2. **Database replication strategies**
3. **Alternative database backends** (future enhancement)

### Vertical Scaling

Increase resources:

```yaml
# docker-compose.prod.yml
deploy:
  resources:
    limits:
      memory: 4G
      cpus: 2.0
```

### Resource Recommendations

| Load Level | Memory | CPUs | Instances |
|------------|--------|------|-----------|
| Light (<100 connections) | 512MB | 0.5 | 1 |
| Medium (<1000 connections) | 1GB | 1.0 | 1 |
| Heavy (<5000 connections) | 2GB | 2.0 | 1-2 |

## Security

### Security Features

The production image includes:

- ✅ Non-root user (uid: 1001)
- ✅ Minimal Alpine base image
- ✅ No unnecessary packages
- ✅ Read-only root filesystem where possible
- ✅ Security options enabled
- ✅ Network isolation

### Best Practices

1. **Use HTTPS/WSS in production:**
   ```bash
   # Use reverse proxy (nginx, traefik, caddy)
   # Terminate TLS at the proxy level
   ```

2. **Regular updates:**
   ```bash
   # Update to latest images regularly
   docker pull evoluhq/relay:latest
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Secrets management:**
   ```bash
   # Use Docker secrets or environment-specific configs
   # Never commit secrets to version control
   ```

4. **Network security:**
   ```bash
   # Use Docker networks for isolation
   # Expose only necessary ports
   # Use firewall rules
   ```

## Backup & Recovery

### Database Backup

```bash
# Backup SQLite database
docker cp evolu-relay-production:/app/data/evolu-relay.db ./backup-$(date +%Y%m%d).db

# Automated backup script
#!/bin/bash
BACKUP_DIR=/backups
DATE=$(date +%Y%m%d-%H%M%S)
docker cp evolu-relay-production:/app/data/evolu-relay.db $BACKUP_DIR/evolu-relay-$DATE.db
# Keep last 7 days
find $BACKUP_DIR -name "evolu-relay-*.db" -mtime +7 -delete
```

### Volume Backup

```bash
# Backup entire volume
docker run --rm \
  -v evolu-relay-prod-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/evolu-relay-volume-$(date +%Y%m%d).tar.gz /data
```

### Restore

```bash
# Stop container
docker-compose -f docker-compose.prod.yml down

# Restore database
docker run --rm \
  -v evolu-relay-prod-data:/data \
  -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/evolu-relay-volume-20240101.tar.gz --strip 1"

# Start container
docker-compose -f docker-compose.prod.yml up -d
```

## Testing Production Image

Run the automated test suite:

```bash
cd apps/relay
pnpm docker:prod:test
```

This will verify:
- ✅ Image builds successfully
- ✅ Container starts and responds
- ✅ Health checks pass
- ✅ Security configuration (non-root user)
- ✅ Package versions

## Support

For issues, questions, or contributions:

- **GitHub Issues:** https://github.com/evoluhq/evolu/issues
- **Documentation:** https://evolu.dev
- **Discord Community:** [Join us](https://evolu.dev)

## License

MIT License - see LICENSE file for details

