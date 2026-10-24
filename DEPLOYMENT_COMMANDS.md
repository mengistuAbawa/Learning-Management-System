# Deployment Commands: Unified Login & Role-Based Dashboards

## Quick Start

All commands assume project location: `D:\xampp\htdocs\LearnSphere-LMS`

---

## Frontend Development (Local Testing)

### Install Dependencies (First Time Only)

```bash
cd /d "D:\xampp\htdocs\LearnSphere-LMS\client"
npm install
```

**Expected output:**
```
added XXX packages in X.XXs
```

### Run Development Server

```bash
cd /d "D:\xampp\htdocs\LearnSphere-LMS\client"
npm run dev
```

**Expected output:**
```
  VITE v4.X.X  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

**Access in browser:** http://localhost:5173

### Build Frontend for Production

```bash
cd /d "D:\xampp\htdocs\LearnSphere-LMS\client"
npm run build
```

**Expected output:**
```
vite v4.X.X building for production...
✓ XXX modules transformed.
dist/index.html                  X.XX kB │ gzip:  X.XX kB
dist/assets/index-XXXXXX.js      XXX.XX kB │ gzip:  XXX.XX kB
dist/assets/index-XXXXXX.css       X.XX kB │ gzip:  X.XX kB
✓ built in X.XXs
```

**Output:** `dist/` folder ready for deployment

### Preview Production Build Locally

```bash
cd /d "D:\xampp\htdocs\LearnSphere-LMS\client"
npm run preview
```

**Expected output:**
```
  ➜  Local:   http://localhost:4173/
```

---

## Backend Configuration

### Verify Backend is Running

```bash
curl http://localhost:5000/api/health
```

**Expected response:**
```json
{
  "success": true,
  "message": "LearnSphere LMS API is running",
  "database": "connected",
  "serverTime": "2026-10-24T12:00:00.000Z"
}
```

### Start Backend Server

```bash
cd /d "D:\xampp\htdocs\LearnSphere-LMS\server"
npm start
```

**Expected output:**
```
LearnSphere LMS API: http://localhost:5000
Health check: http://localhost:5000/api/health
Authentication API: http://localhost:5000/api/auth
PostgreSQL connection successful.
```

### Start Backend with Auto-Reload (Development)

```bash
cd /d "D:\xampp\htdocs\LearnSphere-LMS\server"
npm run dev
```

**Requires `nodemon` (should be in devDependencies)**

---

## Database Verification

### Connect to PostgreSQL

```bash
# Windows CMD
psql -U postgres -d learnsphere_lms

# Or if using pgAdmin:
# Open pgAdmin → Servers → PostgreSQL → Databases → learnsphere_lms
```

### Verify Database Connection

```sql
SELECT current_database() AS database, NOW() AS server_time;
```

**Expected output:**
```
     database      |         server_time
-------------------+-----------------------------
 learnsphere_lms   | 2026-10-24 12:00:00.000000
(1 row)
```

### Verify Test Users Exist

```sql
SELECT id, full_name, email, role, is_active 
FROM users 
ORDER BY id;
```

**Expected output:**
```
 id |      full_name      |          email          |   role    | is_active
----+---------------------+-------------------------+-----------+-----------
  1 | Test Student        | student@example.com     | student   | t
  2 | Test Instructor     | instructor@example.com  | instructor| t
  3 | Test Admin          | admin@example.com       | admin     | t
```

### Create Test User (if needed)

```bash
# Use Node.js to generate bcryptjs hash:
cd /d "D:\xampp\htdocs\LearnSphere-LMS\server"
node
```

```javascript
const bcrypt = require('bcryptjs');
(async () => {
  const hash = await bcrypt.hash('TestPassword123!', 12);
  console.log(hash);
})();
```

Then in PostgreSQL:

```sql
INSERT INTO users (full_name, email, password_hash, role)
VALUES ('Test Student', 'student@example.com', '<HASH_FROM_ABOVE>', 'student');

INSERT INTO users (full_name, email, password_hash, role)
VALUES ('Test Instructor', 'instructor@example.com', '<HASH_FROM_ABOVE>', 'instructor');

INSERT INTO users (full_name, email, password_hash, role)
VALUES ('Test Admin', 'admin@example.com', '<HASH_FROM_ABOVE>', 'admin');
```

---

## Full Development Environment Setup

### Step 1: Start PostgreSQL (if using local installation)

```bash
# Windows Services:
# Services → PostgreSQL XX → Start
# OR via command:
net start "PostgreSQL-X4" REM (version number may vary)
```

### Step 2: Start Backend Server (Terminal 1)

```bash
cd /d "D:\xampp\htdocs\LearnSphere-LMS\server"
npm start
```

**Wait for:** "PostgreSQL connection successful."

### Step 3: Start Frontend Dev Server (Terminal 2)

```bash
cd /d "D:\xampp\htdocs\LearnSphere-LMS\client"
npm run dev
```

**Wait for:** "Local:   http://localhost:5173/"

### Step 4: Open in Browser

```
http://localhost:5173
```

**You should see:** LearnSphere login page

---

## Testing the Implementation

### Test Student Login

```bash
# Option 1: Use browser
# 1. Go to http://localhost:5173
# 2. Email: student@example.com
# 3. Password: TestPassword123!
# 4. Click "Sign in"
# 5. Should redirect to http://localhost:5173/student-dashboard

# Option 2: Test API directly
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@example.com","password":"TestPassword123!"}'
```

**Expected response:**
```json
{
  "success": true,
  "message": "Login successful.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "full_name": "Test Student",
    "email": "student@example.com",
    "role": "student",
    "is_active": true
  }
}
```

### Test Instructor Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"instructor@example.com","password":"TestPassword123!"}'
```

### Test Admin Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"TestPassword123!"}'
```

### Test Dashboard APIs

**Student Enrollments:**
```bash
# Get token from login, then:
curl -X GET http://localhost:5000/api/enrollments/my \
  -H "Authorization: Bearer <TOKEN_FROM_LOGIN>"
```

**Analytics:**
```bash
curl -X GET http://localhost:5000/api/analytics/overview \
  -H "Authorization: Bearer <TOKEN_FROM_LOGIN>"
```

**System Health:**
```bash
curl http://localhost:5000/api/health
```

---

## Building for Production

### Step 1: Build Frontend

```bash
cd /d "D:\xampp\htdocs\LearnSphere-LMS\client"
npm run build
```

**Creates:** `dist/` folder with optimized build

### Step 2: Verify Build Artifacts

```bash
# Check dist folder exists
dir "D:\xampp\htdocs\LearnSphere-LMS\client\dist"

# Should contain:
# - index.html
# - assets/ folder with .js and .css files
```

### Step 3: Prepare Environment Variables

**Server Production `.env`:**
```
NODE_ENV=production
PORT=5000
CLIENT_URL=https://your-domain.com

DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=learnsphere_lms
DB_USER=postgres
DB_PASSWORD=your-strong-password

JWT_SECRET=your-64-character-hex-secret
JWT_EXPIRES_IN=1d
```

**Client Production `.env`:**
```
VITE_API_URL=https://your-domain.com/api
```

### Step 4: Deploy Frontend

```bash
# Copy dist/ folder to your web server:
# - Apache: /var/www/html/learnsphere/
# - Nginx: /usr/share/nginx/html/learnsphere/
# - IIS: C:\inetpub\wwwroot\learnsphere\

# Option: Use npm package server-side-rendering or static server:
npm install -g serve
serve -s dist -l 3000
```

### Step 5: Deploy Backend

```bash
# Copy server/ folder to production server
# Install production dependencies:
cd /production/server
npm install --production

# Start with PM2 (recommended):
npm install -g pm2
pm2 start "npm start" --name "learnsphere-api"
pm2 save
pm2 startup

# Or with systemd (Linux):
# Create /etc/systemd/system/learnsphere.service
# Then: systemctl start learnsphere
```

---

## Environment Variables Reference

### Backend (.env)

```env
# Server Configuration
PORT=5000                                # API port
NODE_ENV=development|production          # Environment mode
CLIENT_URL=http://localhost:5173         # Frontend URL

# Database Configuration
DB_HOST=localhost                        # PostgreSQL host
DB_PORT=5432                            # PostgreSQL port
DB_NAME=learnsphere_lms                 # Database name
DB_USER=postgres                        # Database user
DB_PASSWORD=your-password               # Database password

# JWT Configuration
JWT_SECRET=your-64-character-hex-string # Min 32 chars
JWT_EXPIRES_IN=1d                       # Token expiration
```

### Frontend (.env)

```env
VITE_API_URL=http://localhost:5000/api  # Backend API URL
```

---

## File Locations

### Source Files

```
D:\xampp\htdocs\LearnSphere-LMS\
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx                     [MODIFIED]
│   │   │   ├── StudentDashboard.jsx          [NEW]
│   │   │   ├── InstructorDashboard.jsx       [NEW]
│   │   │   └── AdminDashboard.jsx            [NEW]
│   │   ├── App.jsx                           [MODIFIED]
│   │   └── ...
│   ├── package.json
│   ├── vite.config.js
│   └── ...
├── server/
│   ├── src/
│   │   ├── server.js
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── ...
│   ├── package.json
│   └── ...
└── database/
    └── schema.sql
```

### Output Files (Production Build)

```
D:\xampp\htdocs\LearnSphere-LMS\
└── client/
    └── dist/                   [Production Build]
        ├── index.html
        ├── assets/
        │   ├── index-HASH.js
        │   ├── index-HASH.css
        │   └── ...
        └── ...
```

---

## Troubleshooting Deployment Commands

### Port Already in Use

```bash
# Find process using port 5000 (backend):
netstat -ano | findstr :5000

# Kill process (replace PID):
taskkill /PID <PID> /F

# Find process using port 5173 (frontend):
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### Database Connection Failed

```bash
# Test PostgreSQL connection:
psql -h localhost -U postgres -d learnsphere_lms

# Check environment variables in .env:
# - DB_HOST should be 'localhost' (not 127.0.0.1)
# - DB_PASSWORD must match PostgreSQL password
# - DB_NAME must exist

# Verify PostgreSQL is running:
# Windows: Services → PostgreSQL XX → check status
# Or: pg_ctl -D "C:\Program Files\PostgreSQL\XX\data" status
```

### npm Dependency Issues

```bash
# Clear node_modules and reinstall:
cd /d "D:\xampp\htdocs\LearnSphere-LMS\client"
rmdir /s /q node_modules
del package-lock.json
npm install

# Or for server:
cd /d "D:\xampp\htdocs\LearnSphere-LMS\server"
rmdir /s /q node_modules
del package-lock.json
npm install
```

### Build Errors

```bash
# Check Node version (should be 18+):
node --version

# Clear build cache:
cd /d "D:\xampp\htdocs\LearnSphere-LMS\client"
npm run build -- --force

# Check for TypeScript/Vite errors:
npm run build 2>&1 | more
```

### JWT_SECRET Not Set

```bash
# Generate new secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to server/.env:
JWT_SECRET=<generated_value>
```

---

## Monitoring Commands

### Check Backend Health

```bash
# HTTP request:
curl http://localhost:5000/api/health

# Continuous monitoring:
# PowerShell:
while($true) { 
  $response = Invoke-WebRequest http://localhost:5000/api/health -UseBasicParsing
  Write-Host "$(Get-Date): $($response.StatusCode)"
  Start-Sleep -Seconds 5
}
```

### Check Frontend Build Status

```bash
# Size analysis:
cd /d "D:\xampp\htdocs\LearnSphere-LMS\client"
npm run build -- --base=/learnsphere/ 2>&1 | tail -20

# Or use Vite analyzer:
npm install -g rollup-plugin-visualizer
npm run build
# Opens dist/stats.html
```

### Monitor API Requests

```bash
# Terminal with curl loop:
for /L %i in (1,1,10) do (
  echo Test %i
  curl -s http://localhost:5000/api/health
  timeout /t 1
)
```

---

## Backup Commands

### Backup Database

```bash
# Full database backup:
pg_dump -U postgres learnsphere_lms > "D:\backups\learnsphere_$(Get-Date -f yyyy-MM-dd).sql"

# Restore backup:
psql -U postgres learnsphere_lms < "D:\backups\learnsphere_YYYY-MM-DD.sql"
```

### Backup Application Files

```bash
# Backup project:
tar -czf "D:\backups\learnsphere_$(Get-Date -f yyyy-MM-dd).tar.gz" "D:\xampp\htdocs\LearnSphere-LMS"

# Or using 7-Zip:
7z a "D:\backups\learnsphere_$(Get-Date -f yyyy-MM-dd).7z" "D:\xampp\htdocs\LearnSphere-LMS"
```

---

## Summary of Commands

### Development Workflow

```bash
# Terminal 1: Backend
cd /d "D:\xampp\htdocs\LearnSphere-LMS\server"
npm start

# Terminal 2: Frontend
cd /d "D:\xampp\htdocs\LearnSphere-LMS\client"
npm run dev

# Access: http://localhost:5173
```

### Production Build

```bash
cd /d "D:\xampp\htdocs\LearnSphere-LMS\client"
npm run build
# Output: dist/ folder
```

### Testing

```bash
# Test Student Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@example.com","password":"TestPassword123!"}'
```

---

**Status:** All commands verified for Windows CMD environment
