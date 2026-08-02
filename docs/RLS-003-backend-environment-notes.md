# RLS-003 Backend Environment Notes

## Purpose
This document records the practical DEV and PROD backend environment setup for AI Affirm RLS-003.
It is meant to reduce confusion during DEV UAT, PROD/TestFlight UAT, production promotion, and authentication troubleshooting.

---

## Environment Summary

| Environment | Purpose                         | Branch    | API                            |
| ----------- | ------------------------------- | --------- | ------------------------------ |
| DEV EC2     | Development and DEV UAT backend | `develop` | `http://54.221.158.219:3000`   |
| PROD EC2    | Production backend              | `main`    | `https://api.innerguideai.com` |

Staging is reserved but not used for RLS-003.

---

## Source of Truth
Backend code changes for RLS-003 are made on DEV EC2 and committed to the backend GitHub `develop` branch.

Promotion path:

```
DEV EC2 develop
→ backend GitHub develop
→ backend GitHub main
→ PROD EC2
→ https://api.innerguideai.com
```

---

## DEV Runtime Architecture
DEV consists of two separate Node services.

### Main Application Server

Location:
```
/home/ec2-user/affirmations-app
```

Port:
```
3000
```

Purpose:
- Email/password authentication
- Session management
- User profile APIs
- Affirmation APIs
- Emotion APIs
- Main application backend

Current runtime model:
```
node server.js
```

Verification:
```
sudo lsof -i :3000
```

Expected:
```
node server.js
```

Working directory verification:
```
readlink /proc/<pid>/cwd
```

Expected:
```
/home/ec2-user/affirmations-app
```

---

### Auth Service

Location:
```
/home/ec2-user/innerguide-auth
```

Port:
```
3002
```

Purpose:
- Google Sign-In
- Apple Sign-In
- Firebase token verification
- Authentication proxy endpoints

Health check:
```
curl http://localhost:3002/health
```

Expected:
```json
{
  "status": "ok",
  "db": "connected"
}
```

---

## DEV Backend
DEV backend is used for:
- DEV UAT
- Google login validation
- Apple login validation
- API changes before production promotion
- Endpoint testing from Xcode simulator

DEV backend should not be used for production App Store builds.

---

## PROD Backend
PROD backend is used for:
- Existing App Store users
- PROD/TestFlight UAT
- Final App Store release backend
- Production API endpoint: `https://api.innerguideai.com`

Before PROD deploy, confirm backward compatibility with older frontend versions.

---

## Important API URLs

### DEV
Main API:
```
http://54.221.158.219:3000
```

Auth Service:
```
http://54.221.158.219:3002
```

### PROD
Main API:
```
https://api.innerguideai.com
```

Frontend endpoint switching is controlled by:
```
scripts/switch-api-env.sh
```

---

## PM2 Process Notes
Confirm process names before restarting.

Useful commands:
```
pm2 status
pm2 logs <process-name>
pm2 restart <process-name> --update-env
```

### Current DEV PM2 Process

Auth service:
```
innerguide-auth-dev
```

Logs:
```
pm2 logs innerguide-auth-dev
```

Restart:
```
pm2 restart innerguide-auth-dev --update-env
```

### Important
The main application server is currently NOT managed by PM2.

Verify current runtime:
```
sudo lsof -i :3000
ps -fp <pid>
```

---

## Environment Flags
Relevant auth flags:
```
ENABLE_FIREBASE_GOOGLE_LOGIN=true
ENABLE_FIREBASE_APPLE_LOGIN=true
```

Before PROD promotion, confirm PROD env flags intentionally match the desired release behavior.

---

## Auth Service Environment

Location:
```
/home/ec2-user/innerguide-auth/.env
```

Required variables:
```
GLOBAL_MONGO_URI
FIREBASE_SERVICE_ACCOUNT_PATH
```

Verification:
```
grep -E "GLOBAL_MONGO_URI|FIREBASE_SERVICE_ACCOUNT_PATH" .env
```

Expected Firebase path:
```
/home/ec2-user/innerguide-auth/firebase-service-account.json
```

Dotenv validation:
```
node test-dotenv.js
```

Expected:
```
mongo= true
firebase= /home/ec2-user/innerguide-auth/firebase-service-account.json
```

---

## Health Checks

### Main App
Verify:
```
curl http://localhost:3000/api/me
```

Expected:
```
401 Unauthenticated
```

This confirms:
- Server is running
- Routing is functioning
- Authentication middleware is functioning

### Auth Service
Verify:
```
curl http://localhost:3002/health
```

Expected:
```json
{
  "status": "ok",
  "db": "connected"
}
```

This confirms:
- Service is running
- MongoDB is connected
- Environment variables loaded correctly

---

## Known Good DEV State

Main server:
- Port 3000 listening
- Running from `/home/ec2-user/affirmations-app`
- `/api/me` returns 401 when not authenticated
- Email/password login succeeds

Auth server:
- PM2 process online
- `/health` returns 200
- MongoDB connected
- Firebase service account loaded

Validation example:
```
POST /api/login
```

Expected:
```json
200 OK
{
  "ok": true
}
```

---

## Files and Areas Not to Casually Change

Do not casually change:
- `/home/ec2-user/affirmations-app/.env`
- `/home/ec2-user/innerguide-auth/.env`
- Firebase service account files
- PM2 process names
- MongoDB connection strings
- Nginx config
- Production API DNS
- iOS ATS exceptions
- Generated iOS files under: `ios/App/App/public/`

Frontend source should be changed under:
```
public/
```

Then copied to iOS with:
```
npx cap copy ios
```

---

## Release Safety Checks

### Before DEV UAT
- Frontend points to DEV API
- Generated iOS copy points to DEV API
- Main server running on port 3000
- Auth service PM2 process online
- Backend `develop` branch clean and pushed
- `/health` returns 200
- Email/password login validated

### Before PROD/TestFlight UAT
- Frontend points to PROD API
- Generated iOS copy points to PROD API
- PROD backend runs `main`
- Backward compatibility checklist passed
- Rollback commit recorded

---

## Troubleshooting Authentication

### Email/Password Login Fails
Check:
```
curl http://localhost:3000/api/me
```

Verify:
```
sudo lsof -i :3000
```

Verify process location:
```
readlink /proc/<pid>/cwd
```

Expected:
```
/home/ec2-user/affirmations-app
```

---

### Google Login Fails
Check:
```
pm2 status
```

Verify:
```
innerguide-auth-dev
```

Check:
```
curl http://localhost:3002/health
```

Verify:
```
ENABLE_FIREBASE_GOOGLE_LOGIN=true
```

---

### Apple Login Fails
Check:
```
pm2 status
```

Verify:
```
innerguide-auth-dev
```

Check:
```
curl http://localhost:3002/health
```

Verify:
```
ENABLE_FIREBASE_APPLE_LOGIN=true
```

Verify Firebase service account path is valid.

---

## Related Docs
- `docs/RLS-003-backend-promotion-rollback-checklist.md`
- `docs/RLS-003-api-compatibility-checklist.md`
