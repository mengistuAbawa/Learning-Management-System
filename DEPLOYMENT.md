# LearnSphere LMS Production Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying LearnSphere LMS to a production environment. It covers security hardening, environment configuration, database setup, and verification procedures.

**Last Updated:** October 24, 2026 (Step 17 Complete)

---

## Pre-Deployment Checklist

### Security Verification

- [ ] Read and understand `SECURITY.md`
- [ ] Audit all environment variables for sensitive data
- [ ] Generate new JWT_SECRET for production
- [ ] Ensure database password is 16+ characters with mixed case/numbers/symbols
- [ ] Verify `.gitignore` includes `.env` and `.env.local`
- [ ] Run security tests from `SECURITY.md` Testing section
- [ ] Review rate limiting policies and adjust if needed
- [ ] Verify all endpoints require authentication where appropriate
- [ ] Test certificate verification rate limiting

### Infrastructure Requirements

- [ ] Production server with Node.js 18+ and npm 8+
- [ ] PostgreSQL 12+ database server (separate from application)
- [ ] SSL/TLS certificate (e.g., from Let's Encrypt)
- [ ] Process manager (PM2, systemd, Docker recommended)
- [ ] Firewall configured to allow only necessary ports (80, 443, 3000/app)
- [ ] Backups configured (database daily, application code separately)
- [ ] Monitoring tools configured (logs, metrics, alerts)
- [ ] Load balancer (if using multiple instances)

### Code & Dependencies

- [ ] All changes committed and pushed to main branch
- [ ] No uncommitted work in production environment
- [ ] Dependencies installed: `npm install --production`
- [ ] Security audit passed: `npm audit` (resolve high/critical issues)
- [ ] Build completed successfully: `npm run build` (client)
- [ ] Tests passing: `npm test` (if applicable)
- [ ] Environment variables prepared

---

## Step 1: Environment Preparation

### 1.1 Server Environment Setup

```bash
# SSH into production server
ssh user@production.example.com

# Create application directory
mkdir -p /opt/learnsphere-lms
cd /opt/learnsphere-lms

# Create non-root user for application
sudo useradd -m -s /bin/bash learnsphere
sudo chown -R learnsphere:learnsphere /opt/learnsphere-lms
```

### 1.2 Database Setup

```bash
# Connect to PostgreSQL server
psql -h db.example.com -U postgres

# Create production database and user
CREATE DATABASE learnsphere_lms_prod;
CREATE USER learnsphere_prod WITH PASSWORD 'your_strong_db_password_here';
GRANT ALL PRIVILEGES ON DATABASE learnsphere_lms_prod TO learnsphere_prod;
GRANT USAGE ON SCHEMA public TO learnsphere_prod;
GRANT CREATE ON SCHEMA public TO learnsphere_prod;

# Run schema migration
psql -h db.example.com -U learnsphere_prod -d learnsphere_lms_prod < database/schema.sql
psql -h db.example.com -U learnsphere_prod -d learnsphere_lms_prod < database/migrations/20261023_enrollment_timestamps.sql

# Verify connection
psql -h db.example.com -U learnsphere_prod -d learnsphere_lms_prod -c "SELECT version();"
```

### 1.3 Environment Variables

Create `/opt/learnsphere-lms/server/.env`:

```env
# ============================================================================
# LearnSphere LMS Production Configuration
# ============================================================================

# Server Settings
PORT=3000
NODE_ENV=production

# Client Configuration (use production domain)
CLIENT_URL=https://learnsphere.example.com

# ============================================================================
# Database Configuration (Production)
# ============================================================================

DB_HOST=db.example.com
DB_PORT=5432
DB_NAME=learnsphere_lms_prod
DB_USER=learnsphere_prod
DB_PASSWORD=your_strong_db_password_here

# ============================================================================
# JWT (JSON Web Token) Configuration
# ============================================================================

# Generate new secret: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your_64_character_hex_secret_here_generated_for_production

JWT_EXPIRES_IN=1d

# ============================================================================
# Optional: Logging & Monitoring
# ============================================================================

# LOG_LEVEL=info
# SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
# DATADOG_API_KEY=your-datadog-key
```

**Security Note:** Protect this file with restrictive permissions:
```bash
chmod 600 /opt/learnsphere-lms/server/.env
```

---

## Step 2: Application Deployment

### 2.1 Clone & Install

```bash
cd /opt/learnsphere-lms

# Clone from repository (use SSH or tokens, not hardcoded credentials)
git clone --branch main https://github.com/your-org/learnsphere-lms.git .

# Install backend dependencies
cd server
npm install --production
npm run build # if applicable

# Install frontend dependencies
cd ../client
npm install --production
npm run build

# Verify builds
ls -la client/dist/
```

### 2.2 Verify Installation

```bash
# Test backend
cd server
npm start &  # Start in background
sleep 3
curl http://localhost:3000/api/health

# If health check succeeds, proceed
kill %1  # Stop test server
```

---

## Step 3: SSL/TLS Configuration

### 3.1 Obtain Certificate

For Let's Encrypt:

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot certonly --standalone -d learnsphere.example.com

# Certificate files:
# - Private key: /etc/letsencrypt/live/learnsphere.example.com/privkey.pem
# - Certificate: /etc/letsencrypt/live/learnsphere.example.com/fullchain.pem
```

### 3.2 Configure Nginx (Reverse Proxy)

Create `/etc/nginx/sites-available/learnsphere`:

```nginx
upstream learnsphere_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name learnsphere.example.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name learnsphere.example.com;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/learnsphere.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/learnsphere.example.com/privkey.pem;
    
    # SSL hardening
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Reverse proxy configuration
    location / {
        proxy_pass http://learnsphere_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static file caching (frontend assets)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://learnsphere_backend;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Logging
    access_log /var/log/nginx/learnsphere_access.log;
    error_log /var/log/nginx/learnsphere_error.log;
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/learnsphere /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Step 4: Process Management

### 4.1 Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 ecosystem file (~/ecosystem.config.js)
cat > /opt/learnsphere-lms/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'learnsphere-api',
      script: './server/src/server.js',
      cwd: '/opt/learnsphere-lms',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 'max',
      exec_mode: 'cluster',
      error_file: '/var/log/learnsphere-api-error.log',
      out_file: '/var/log/learnsphere-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    }
  ]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js

# Setup auto-start on reboot
pm2 startup systemd -u learnsphere
pm2 save
```

### 4.2 Using Systemd

Create `/etc/systemd/system/learnsphere-api.service`:

```ini
[Unit]
Description=LearnSphere LMS API
After=network.target

[Service]
Type=simple
User=learnsphere
WorkingDirectory=/opt/learnsphere-lms
EnvironmentFile=/opt/learnsphere-lms/server/.env
ExecStart=/usr/bin/node /opt/learnsphere-lms/server/src/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable learnsphere-api
sudo systemctl start learnsphere-api
sudo systemctl status learnsphere-api
```

---

## Step 5: Monitoring & Logging

### 5.1 Application Logging

```bash
# View logs with PM2
pm2 logs learnsphere-api

# Or with systemd
sudo journalctl -u learnsphere-api -f
```

### 5.2 Health Check Monitoring

```bash
# Setup Cron job to monitor health (every 5 minutes)
*/5 * * * * curl -sf https://learnsphere.example.com/api/health || (echo "Health check failed" | mail -s "LearnSphere API Down" admin@example.com)
```

### 5.3 Database Monitoring

```bash
# Monitor connections
psql -h db.example.com -U learnsphere_prod -d learnsphere_lms_prod << 'EOF'
SELECT datname, count(*) as connections 
FROM pg_stat_activity 
GROUP BY datname;
EOF
```

---

## Step 6: Backups

### 6.1 Daily Database Backup

Create `/opt/learnsphere-lms/backup-db.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/backups/learnsphere-lms"
DB_HOST="db.example.com"
DB_NAME="learnsphere_lms_prod"
DB_USER="learnsphere_prod"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/db_backup_$DATE.sql.gz"

mkdir -p $BACKUP_DIR

# Backup database
PGPASSWORD=$DB_PASSWORD pg_dump \
  -h $DB_HOST \
  -U $DB_USER \
  -d $DB_NAME | gzip > $BACKUP_FILE

# Keep only last 30 days of backups
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +30 -delete

echo "Database backup completed: $BACKUP_FILE"
```

Add to crontab:
```bash
0 2 * * * /opt/learnsphere-lms/backup-db.sh
```

### 6.2 Application Code Backup

```bash
# Backup application code
tar -czf /backups/learnsphere-lms/app_$(date +%Y%m%d).tar.gz /opt/learnsphere-lms

# Test restore (monthly)
tar -tzf /backups/learnsphere-lms/app_backup.tar.gz | head -20
```

---

## Step 7: Post-Deployment Verification

### 7.1 Health Checks

```bash
# API Health
curl -k https://learnsphere.example.com/api/health

# Expected output:
# {"success":true,"message":"LearnSphere LMS API is running","database":"connected","serverTime":"2026-10-24T..."}

# Certificate Verification Rate Limit Test
for i in {1..15}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "https://learnsphere.example.com/api/certificates/verify/test-$i")
  echo "Request $i: HTTP $STATUS"
done

# Verify some requests return 429 (Too Many Requests)
```

### 7.2 Security Verification

```bash
# Test authentication required
curl -X GET https://learnsphere.example.com/api/progress
# Should return 401 Unauthorized

# Test SSL/TLS
openssl s_client -connect learnsphere.example.com:443 -tls1_2
# Verify certificate is valid and trusted

# Test security headers
curl -I https://learnsphere.example.com/api/health
# Verify Strict-Transport-Security and other security headers present
```

### 7.3 Database Verification

```bash
# Check database is responding
psql -h db.example.com -U learnsphere_prod -d learnsphere_lms_prod -c "SELECT COUNT(*) FROM users;"

# Check tables exist
psql -h db.example.com -U learnsphere_prod -d learnsphere_lms_prod -c "\dt"
```

---

## Step 8: Ongoing Maintenance

### 8.1 Security Updates

```bash
# Check for security advisories
npm audit

# Update dependencies (test in staging first)
npm update

# Restart application
pm2 restart learnsphere-api
# OR
sudo systemctl restart learnsphere-api
```

### 8.2 JWT Secret Rotation (Quarterly)

```bash
# Generate new secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update in production .env
# Restart application (old tokens become invalid)
# Notify users to re-login

sudo systemctl restart learnsphere-api
```

### 8.3 SSL Certificate Renewal

```bash
# Let's Encrypt certificates auto-renew, but verify
sudo certbot renew --dry-run

# Or manually
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

### 8.4 Database Maintenance

```bash
# Analyze query performance
psql -h db.example.com -U learnsphere_prod -d learnsphere_lms_prod -c "ANALYZE;"

# Vacuum (cleanup dead rows)
psql -h db.example.com -U learnsphere_prod -d learnsphere_lms_prod -c "VACUUM ANALYZE;"
```

---

## Troubleshooting

### Application Won't Start

```bash
# Check error logs
sudo journalctl -u learnsphere-api -n 50

# Check if port is in use
sudo lsof -i :3000

# Verify environment variables
source /opt/learnsphere-lms/server/.env
echo $JWT_SECRET
echo $DB_PASSWORD
```

### Database Connection Failure

```bash
# Test database connectivity
psql -h db.example.com -U learnsphere_prod -d learnsphere_lms_prod -c "SELECT 1;"

# Check database is running
systemctl status postgresql

# Check firewall rules
sudo ufw status
sudo ufw allow 5432/tcp  # if needed
```

### Rate Limiting Issues

```bash
# Check rate limit violations in logs
sudo journalctl -u learnsphere-api | grep "429\|rate"

# Adjust global rate limit (if needed)
# server/src/server.js, line 45-54
```

### SSL Certificate Issues

```bash
# Verify certificate is valid
openssl x509 -in /etc/letsencrypt/live/learnsphere.example.com/fullchain.pem -text -noout

# Check certificate expiration
sudo certbot certificates

# Renew if needed
sudo certbot renew --force-renewal
```

---

## Rollback Procedure

If issues occur after deployment:

```bash
# Stop current version
pm2 stop learnsphere-api

# Revert to previous commit
cd /opt/learnsphere-lms
git checkout HEAD~1

# Reinstall dependencies
cd server && npm install --production && cd ../client && npm install --production

# Start previous version
pm2 start ecosystem.config.js

# Monitor
pm2 logs learnsphere-api
```

---

## Support & Contact

- **Documentation**: Read `SECURITY.md` for security guidelines
- **Issues**: Check logs first, then consult troubleshooting guide
- **Updates**: Subscribe to GitHub releases for updates
- **Security**: Contact security team for vulnerabilities

---

## Deployment Checklist Summary

- [ ] Environment variables configured
- [ ] Database setup and migrated
- [ ] SSL/TLS certificate installed
- [ ] Nginx reverse proxy configured
- [ ] Process manager (PM2 or systemd) running
- [ ] Monitoring and alerting configured
- [ ] Backup system verified
- [ ] Health checks passing
- [ ] Security headers verified
- [ ] Rate limiting tested
- [ ] Database backups tested
- [ ] Rollback procedure documented
- [ ] Team trained on deployment
- [ ] Go/No-go approval received

**Deployment completed successfully!**
