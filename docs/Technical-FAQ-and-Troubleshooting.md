# Technical FAQ and Troubleshooting

## Purpose
This document captures common AI Affirm technical issues, root causes, diagnostics, and resolutions.
Use this before investigating backend, frontend, iOS, authentication, or deployment issues.

---

## Architecture FAQ

### What services exist in DEV?
DEV consists of two backend services:

#### Main Application Server

Location:
```
/home/ec2-user/affirmations-app
```

Port:
```
3000
```

Responsibilities:
- Email/password login
- User accounts
- Sessions
- Profile APIs
- Emotion APIs
- Affirmation APIs

#### Auth Service

Location:
```
/home/ec2-user/innerguide-auth
```

Port:
```
3002
```

Responsibilities:
- Google Sign-In
- Apple Sign-In
- Firebase token verification

### Is the main app managed by PM2?
No.

Current DEV configuration: `affirmations-app` runs as:
```
node server.js
```

Verify:
```
sudo lsof -i :3000
```

### Is the auth service managed by PM2?
Yes.

Current DEV process:
```
innerguide-auth-dev
```

Verify:
```
pm2 status
```

---

## Authentication FAQ

### Email/password login fails

Verify backend is running:
```
curl http://localhost:3000/api/me
```

Expected:
```json
{"message": "Unauthenticated"}
```

If request fails:
```
sudo lsof -i :3000
```

### Google login fails

Verify auth service:
```
curl http://localhost:3002/health
```

Expected:
```json
{
  "status": "ok"
}
```

Verify PM2 process:
```
pm2 status
```

Expected:
```
innerguide-auth-dev
```

Verify Google login enabled:
```
grep ENABLE_FIREBASE_GOOGLE_LOGIN .env
```

Expected:
```
ENABLE_FIREBASE_GOOGLE_LOGIN=true
```

### Apple login fails

Verify auth service:
```
curl http://localhost:3002/health
```

Expected:
```json
{
  "status": "ok"
}
```

Verify Apple login enabled:
```
grep ENABLE_FIREBASE_APPLE_LOGIN .env
```

Expected:
```
ENABLE_FIREBASE_APPLE_LOGIN=true
```

---

## DEV Access FAQ

### Local frontend cannot reach DEV API

**Symptom**

Frontend hangs during login. Browser shows:
```
Failed to fetch
```
or
```
Network Error
```
or request times out.

**Test**

From Mac:
```
curl http://54.221.158.219:3000/api/me
```

Expected:
```json
{"message": "Unauthenticated"}
```

If request times out: DEV API is unreachable.

**Most common cause**

Public IP changed.

Check:
```
curl -4 ifconfig.me
```

Compare with EC2 Security Group inbound rule.

**Common triggers**
- Power outage
- Router reboot
- Modem reboot
- ISP maintenance
- DHCP renewal

**Fix**

Update EC2 Security Group:
```
Port: 3000
Source: <current-ip>/32
```

---

## MongoDB FAQ

### Verify Mongo connection

**Main app**

Check startup logs. Expected:
```
MongoDB connected
```

**Auth service**
```
curl http://localhost:3002/health
```

Expected:
```json
{
  "db": "connected"
}
```

---

## Environment FAQ

### Which .env file controls what?

**Main app**
```
/home/ec2-user/affirmations-app/.env
```

Controls:
- Main API
- Sessions
- Users
- Affirmations

**Auth service**
```
/home/ec2-user/innerguide-auth/.env
```

Controls:
- Firebase
- Google login
- Apple login

### Verify auth service .env loads

Create:
```js
require('dotenv').config();

console.log(!!process.env.GLOBAL_MONGO_URI);
console.log(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
```

Expected:
```
true
/home/ec2-user/innerguide-auth/firebase-service-account.json
```

---

## Frontend FAQ

### Which API is the app using?

Search:
```
grep -R "54.221.158.219\|api.innerguideai.com" public ios/App/App/public
```

DEV expected:
```
http://54.221.158.219:3000
```

PROD expected:
```
https://api.innerguideai.com
```

### Frontend changed but iOS did not

Copy assets:
```
npx cap copy ios
```

---

## Health Checks

### Main backend healthy
```
curl http://localhost:3000/api/me
```

Expected:
```json
{"message": "Unauthenticated"}
```

### Auth backend healthy
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

## Known Incidents

### June 2026 — DEV login outage

**Symptoms**
- Email/password login failed
- Google login failed
- Apple login failed

**Investigation**

Verified:
- Main backend healthy
- Auth backend healthy
- Mongo healthy
- Firebase healthy
- Frontend pointed to DEV

**Root Cause**

AWS Security Group allowed:
```
100.14.65.26/32
```

Current home IP:
```
100.14.72.179/32
```

Power outage caused ISP to assign a new public IP.

**Resolution**

Updated Security Group to current public IP.

**Code Changes**
```
None
```

---

> This last section ("Known Incidents") is the most valuable part. After a few incidents, the FAQ becomes your operational memory and prevents re-investigating the same problems repeatedly.
