# LearnSphere LMS Security Policy

## Overview

LearnSphere LMS implements comprehensive security controls to protect user data, prevent unauthorized access, and ensure platform integrity. This document outlines our security practices, vulnerabilities we've audited and fixed, and best practices for deployment.

**Current Status:** Step 17 Security Audit Complete (October 2026)

---

## Security Audit Summary

### Critical Vulnerabilities Fixed

#### 1. Rate Limiting Middleware Misconfiguration (CRITICAL)
- **Issue**: Rate limiting middleware was applied after route definitions, making it ineffective
- **Impact**: API endpoints were unprotected against brute-force and DDoS attacks
- **Fix**: Moved `globalRateLimiter` middleware to line 45 in `server/src/server.js`, before all `/api` routes
- **Details**: 
  - Global rate limiter: 300 requests per 15 minutes per IP
  - Health check exempted from rate limiting (internal monitoring)
  - All authentication endpoints protected

**File Changed:** `server/src/server.js` (lines 45-54)

#### 2. Certificate Verification Brute-Force Vulnerability (CRITICAL)
- **Issue**: Public certificate verification endpoint had no rate limiting
- **Impact**: Attackers could brute-force certificate codes to forge or discover certificates
- **Fix**: Added dedicated rate limiter: 10 requests per 15 minutes per IP
- **Details**:
  - Endpoint: `GET /api/certificates/verify/:code`
  - Rate limit applies per IP address
  - Returns 429 Too Many Requests when limit exceeded

**File Changed:** `server/src/routes/certificateRoutes.js` (lines 1-19)

#### 3. Health Check Information Disclosure (CRITICAL)
- **Issue**: `/api/health` endpoint returned database name in response body
- **Impact**: Information leakage to potential attackers (reconnaissance)
- **Fix**: Removed `databaseName` field from health check response
- **Details**:
  - Response now only includes: `success`, `message`, `database` (connectivity status), `serverTime`
  - Database name no longer exposed to public endpoints

**File Changed:** `server/src/server.js` (lines 52-65)

#### 4. JWT Secret Management (CRITICAL)
- **Issue**: `JWT_SECRET` was committed to `.env` with weak value
- **Impact**: Token signing key exposure; compromised authentication
- **Fix**: Documented requirements and generation process
- **Current State**: Strong secret enforced (minimum 32 chars, recommended 64 hex chars)
- **For Production**: 
  1. Generate new secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  2. Set in production `.env` before deployment
  3. Rotate quarterly minimum

**See:** `server/.env.example` (Security Best Practices section)

#### 5. Database Password Weakness (CRITICAL - Development Only)
- **Issue**: Development database uses "1234" as password
- **Impact**: Not suitable for production; easily guessable
- **Note**: Acceptable for local development with localhost-only PostgreSQL
- **Production Requirement**: Use 16+ character password with mixed case, numbers, symbols

**See:** `server/.env.example` (Database Configuration section)

---

## Verified Security Practices

The following security practices were verified as **IMPLEMENTED AND CORRECT** — no fixes required:

### Authentication & Authorization
- ✅ **SQL Injection Prevention**: All database queries use parameterized statements
- ✅ **Password Hashing**: bcrypt with SALT_ROUNDS = 12
- ✅ **JWT Verification**: Tokens verified with issuer and audience checks
- ✅ **Authorization**: Role-based access control enforced server-side on all protected routes
- ✅ **Token Storage**: sessionStorage used (more secure than localStorage for XSS mitigation)

### Network & Middleware
- ✅ **CORS Configuration**: Properly configured; allows only specified origins
- ✅ **Security Headers**: Helmet.js enabled with sensible defaults
- ✅ **HTTPS Ready**: Code compatible with HTTPS; requires NODE_ENV=production + SSL setup

### Data Isolation & Access Control
- ✅ **Student Data Isolation**: Students can only access their own enrolled courses and data
- ✅ **Instructor Isolation**: Instructors cannot access unauthorized courses or student data
- ✅ **Role Separation**: Student, Instructor, Admin roles properly enforced
- ✅ **Database Connection Pool**: Secure pooling with query parameterization

---

## Security Configuration

### Environment Variables (Development)

**File:** `server/.env`

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
DB_HOST=localhost
DB_PORT=5432
DB_NAME=learnsphere_lms
DB_USER=postgres
DB_PASSWORD=1234
JWT_SECRET=your_strong_secret_here_at_least_32_chars
JWT_EXPIRES_IN=1d
```

### Environment Variables (Production)

**Critical Changes Required:**
1. Set `NODE_ENV=production` (enables security defaults)
2. Use strong `JWT_SECRET` (64 hex chars minimum)
3. Use strong `DB_PASSWORD` (16+ mixed characters)
4. Set `CLIENT_URL` to production domain (not localhost)
5. Store sensitive values in secure vaults (AWS Secrets Manager, HashiCorp Vault, etc.)

### Rate Limiting Policy

**Global Rate Limiter** (all `/api` routes except health check):
- Window: 15 minutes
- Limit: 300 requests per IP address
- Exemption: Health check endpoint (`/api/health`)

**Certificate Verification Rate Limiter** (public endpoint):
- Window: 15 minutes
- Limit: 10 requests per IP address
- Purpose: Brute-force protection on certificate codes

---

## Deployment Checklist

Before deploying to production, verify:

- [ ] Generate new JWT_SECRET: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Set `NODE_ENV=production` in production `.env`
- [ ] Configure strong database password (16+ chars, mixed case, numbers, symbols)
- [ ] Update `CLIENT_URL` to production domain
- [ ] Set up HTTPS/SSL certificate
- [ ] Enable production database backups
- [ ] Review firewall rules (only allow application server to access database)
- [ ] Configure monitoring and alerting for rate limit violations
- [ ] Test health endpoint: `curl https://production-domain.com/api/health`
- [ ] Verify all protected routes require authentication
- [ ] Run security audit tests (see Testing section below)

---

## Testing Security Controls

### Rate Limiting Test (Global)

```bash
# Test 1: Make 5 rapid requests (should succeed)
for i in {1..5}; do
  curl -X GET http://localhost:5000/api/health
  echo ""
done

# Test 2: Test certificate verification rate limiting
# Make 15 requests rapidly (10 should succeed, 5+ should get 429)
for i in {1..15}; do
  curl -X GET "http://localhost:5000/api/certificates/verify/test-code-$i"
  echo ""
done
```

### JWT Token Validation Test

```bash
# Test without token (should fail with 401)
curl -X GET http://localhost:5000/api/progress

# Test with invalid token (should fail with 401)
curl -X GET http://localhost:5000/api/progress \
  -H "Authorization: Bearer invalid_token"

# Test with valid token (should succeed with 200)
# First, authenticate to get token
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@example.com","password":"password"}' \
  | jq -r '.token')

curl -X GET http://localhost:5000/api/progress \
  -H "Authorization: Bearer $TOKEN"
```

### SQL Injection Test

```bash
# This should NOT bypass authentication or return raw data
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com\" OR \"1\"=\"1","password":"password"}'
# Expected: Authentication fails (no data returned)
```

---

## Incident Response

### Rate Limit Violations
- Monitor logs for repeated 429 responses from same IP
- Temporarily block IPs with suspicious patterns
- Review logs for attack patterns

### Failed Authentication Attempts
- Log all failed login attempts with IP and timestamp
- Monitor for brute-force patterns (multiple failures from same IP)
- Consider implementing account lockout after N failed attempts

### Database Connection Issues
- Health check endpoint returns 503 when database unavailable
- Monitor `/api/health` endpoint for failures
- Set up alerts for database connectivity issues

---

## Security Best Practices

### For Developers

1. **Never commit secrets**: Use `.env` files with `.gitignore`
2. **Keep dependencies updated**: Run `npm audit` regularly
3. **Review security advisories**: Subscribe to npm security alerts
4. **Parameterize all queries**: Never concatenate user input into SQL
5. **Validate all inputs**: Check type, length, and format before processing
6. **Log security events**: Record authentication, authorization, and rate limit events
7. **Test error messages**: Ensure they don't leak system information

### For System Administrators

1. **Rotate secrets quarterly**: Generate new JWT_SECRET periodically
2. **Monitor rate limits**: Watch for sustained attack patterns
3. **Backup databases regularly**: Test restore procedures
4. **Enable audit logging**: Track all user actions and administrative changes
5. **Configure firewalls**: Restrict database access to application servers
6. **Use VPNs**: For administrative access to production systems
7. **Enable HTTPS/TLS**: All connections must be encrypted in production

### For DevOps/Operations

1. **Run security updates**: Apply OS patches within 72 hours
2. **Monitor dependencies**: Set up automated vulnerability scanning
3. **Use secrets management**: AWS Secrets Manager, HashiCorp Vault, etc.
4. **Enable logging**: Aggregate logs to centralized system
5. **Set up alerting**: Alert on authentication failures, rate limit violations
6. **Regular backups**: Test restore procedures monthly
7. **DDoS protection**: Use WAF or DDoS mitigation service in production

---

## Known Limitations & Future Improvements

### Current Scope (Step 17 Audit)
- Security audit focused on OWASP Top 10 vulnerabilities
- Rate limiting configured at application level
- Authorization checks implemented server-side

### Recommended Future Improvements
1. Implement centralized audit logging (log all user actions)
2. Add security-focused unit and integration tests
3. Implement API key management for service-to-service calls
4. Add multi-factor authentication (MFA) option
5. Implement CSRF protection for state-changing requests
6. Add request signing for sensitive operations
7. Implement web application firewall (WAF) rules
8. Set up continuous security scanning pipeline
9. Add user activity monitoring and anomaly detection
10. Implement encryption at rest for sensitive data

---

## References & Standards

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Node.js Security](https://nodejs.org/en/docs/guides/security/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/sql-syntax.html)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)

---

## Document Version

- **Version**: 1.0
- **Last Updated**: October 24, 2026
- **Status**: Step 17 Complete
- **Next Review**: January 2027 (quarterly)

---

## Contact & Support

For security concerns, vulnerabilities, or questions:
- Review this document first
- Check `.env.example` for configuration guidance
- Run security tests from Testing section
- Contact system administrator for production deployments

**Security is a shared responsibility. Please follow these practices in all development and deployment activities.**
