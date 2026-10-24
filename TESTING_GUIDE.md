# Testing Guide: Unified Login & Role-Based Dashboards

## Overview

This guide walks through testing the unified login system and three role-specific dashboards for LearnSphere LMS.

---

## Prerequisites

### Running Services

Ensure both backend and frontend are running:

```bash
# Terminal 1: Backend (in D:\xampp\htdocs\LearnSphere-LMS\server)
cd /d D:\xampp\htdocs\LearnSphere-LMS\server
npm start
# Should show: "LearnSphere LMS API: http://localhost:5000"

# Terminal 2: Frontend (in D:\xampp\htdocs\LearnSphere-LMS\client)
cd /d D:\xampp\htdocs\LearnSphere-LMS\client
npm run dev
# Should show: "Local: http://localhost:5173"
```

### Test Database

Ensure PostgreSQL database `learnsphere_lms` has test users:

```bash
# Connect to PostgreSQL
psql -U postgres -d learnsphere_lms

# View existing users:
SELECT id, full_name, email, role, is_active FROM users LIMIT 5;

# If no test users, create them:
INSERT INTO users (full_name, email, password_hash, role)
VALUES 
  ('Test Student', 'student@example.com', '$2a$12$...', 'student'),
  ('Test Instructor', 'instructor@example.com', '$2a$12$...', 'instructor'),
  ('Test Admin', 'admin@example.com', '$2a$12$...', 'admin');
```

**Note:** Password hashes must be bcryptjs-generated (12 salt rounds). Use a bcrypt online tool or Node.js:

```javascript
const bcrypt = require('bcryptjs');
const hash = await bcrypt.hash('TestPassword123!', 12);
console.log(hash);
```

---

## Test Case 1: Unified Login - Student Account

### Steps

1. **Navigate to Login Page**
   - Open http://localhost:5173/login in browser
   - Verify login form displays

2. **Enter Student Credentials**
   - Email: `student@example.com`
   - Password: `TestPassword123!` (or your test password)
   - Click "Sign in" button

3. **Verify Loading State**
   - Button should show "Signing in..." with spinner
   - Request should be sent to backend

4. **Verify Redirect to Student Dashboard**
   - After successful login, should redirect to `/student-dashboard` (NOT `/dashboard`)
   - URL should show: `http://localhost:5173/student-dashboard`
   - Page should load with student-specific dashboard

### Expected Result

✅ Successfully redirected to `/student-dashboard` with student role displayed in header

---

## Test Case 2: Unified Login - Instructor Account

### Steps

1. **Navigate to Login Page**
   - Open http://localhost:5173/login in browser (or logout if logged in)

2. **Enter Instructor Credentials**
   - Email: `instructor@example.com`
   - Password: `TestPassword123!`
   - Click "Sign in" button

3. **Verify Redirect to Instructor Dashboard**
   - After successful login, should redirect to `/instructor-dashboard`
   - URL should show: `http://localhost:5173/instructor-dashboard`
   - Header should display "Instructor" role

### Expected Result

✅ Successfully redirected to `/instructor-dashboard` with instructor-specific UI (cyan theme)

---

## Test Case 3: Unified Login - Admin Account

### Steps

1. **Navigate to Login Page**
   - Open http://localhost:5173/login

2. **Enter Admin Credentials**
   - Email: `admin@example.com`
   - Password: `TestPassword123!`
   - Click "Sign in" button

3. **Verify Redirect to Admin Dashboard**
   - Should redirect to `/admin-dashboard`
   - URL shows: `http://localhost:5173/admin-dashboard`
   - Header displays "Administrator" role

### Expected Result

✅ Successfully redirected to `/admin-dashboard` with admin-specific UI (amber/orange theme)

---

## Test Case 4: Invalid Credentials

### Steps

1. **Login with Wrong Password**
   - Email: `student@example.com`
   - Password: `WrongPassword123!`
   - Click "Sign in"

2. **Verify Error Message**
   - Should display: "Invalid email or password."
   - Form should remain visible
   - Should NOT redirect

3. **Verify Generic Error (Security)**
   - Try with non-existent email: `nonexistent@example.com`
   - Should get same error message (no email enumeration)

### Expected Result

✅ Generic error message displayed, form remains, no redirect

---

## Test Case 5: Missing Credentials

### Steps

1. **Leave Email Empty**
   - Email: (empty)
   - Password: `TestPassword123!`
   - Click "Sign in"

2. **Verify Validation Error**
   - Should display: "Enter your email address and password."
   - Should NOT submit

3. **Leave Password Empty**
   - Email: `student@example.com`
   - Password: (empty)
   - Click "Sign in"

4. **Verify Validation Error**
   - Should display: "Enter your email address and password."

### Expected Result

✅ Client-side validation works, no submission on missing fields

---

## Test Case 6: Student Dashboard - Data Loading

### Steps

1. **Login as Student**
   - (Complete Test Case 1)

2. **Verify Welcome Section**
   - Should show: "Welcome back, [First Name]!"
   - Should display stats: "X courses enrolled", "X courses completed"

3. **Verify Dashboard Data**
   - **Stats Grid:** Shows Enrolled Courses, In Progress, Completed, Completion %
   - **Enrolled Courses Section:** Lists active courses from `/api/enrollments/my`
   - **Assignments Section:** Shows upcoming assignments (if any)
   - **Quick Links Sidebar:** Browse Courses, My Learning, Certificates, Notifications
   - **Recent Achievements:** Shows completed courses

4. **Verify Empty States** (if applicable)
   - If no courses: "No courses in progress" message with "Browse Courses" button
   - If no assignments: "No upcoming assignments" message

5. **Verify Loading State**
   - On first page load, should show "Loading your dashboard..."
   - Should disappear once data loads

### Expected Result

✅ Dashboard displays real data from backend APIs with proper loading states

---

## Test Case 7: Student Dashboard - Navigation

### Steps

1. **Test Header Links**
   - Click "Browse Courses" → should navigate to `/courses`
   - Click "My Learning" → should navigate to `/my-learning`
   - Click "Certificates" → should navigate to `/certificates`
   - Click NotificationBell → should show notification count

2. **Test Sidebar Links**
   - Each link should navigate to intended page

3. **Test Logout**
   - Click "Logout" button
   - Should clear token from sessionStorage
   - Should redirect to `/login`
   - Browser DevTools > Application > sessionStorage should show `learnsphere_token` is gone

### Expected Result

✅ All navigation links work correctly, logout clears session

---

## Test Case 8: Instructor Dashboard - Course Management

### Steps

1. **Login as Instructor**
   - (Complete Test Case 2)

2. **Verify Course Statistics**
   - Total Courses: Should match count of courses where `instructor_id` = logged-in user
   - Published: Count of courses with status='published'
   - Draft: Count of courses with status='draft'
   - Total Students: Sum of enrollment_count across all instructor's courses

3. **Verify Courses List**
   - Each course should show:
     - Course title
     - Number of students enrolled
     - Status badge (Published/Draft)
     - "Manage" link to course detail page

4. **Verify Submissions Section**
   - Should list submissions awaiting grading
   - Each submission shows: student name, assignment title, course
   - Empty state if no pending submissions

### Expected Result

✅ Instructor dashboard displays real course and submission data

---

## Test Case 9: Admin Dashboard - Platform Statistics

### Steps

1. **Login as Admin**
   - (Complete Test Case 3)

2. **Verify Key Metrics**
   - Total Users: FROM analytics overview
   - Total Courses: FROM analytics overview
   - Total Enrollments: FROM analytics overview
   - Activity: Shows "Live"

3. **Verify Role Distribution**
   - Students: COUNT from analytics
   - Instructors: COUNT from analytics
   - Administrators: COUNT from analytics

4. **Verify Platform Overview**
   - Course Distribution section shows:
     - Published courses count
     - Draft courses count
     - Archived courses count
   - Platform Health section shows:
     - API Status (Running/Degraded)
     - Database connectivity (Connected/Disconnected)

5. **Verify Sidebar**
   - "Administration" links work (Manage Courses, View Analytics)
   - "System Information" shows platform version and last health check

### Expected Result

✅ Admin dashboard displays platform-wide statistics and health status

---

## Test Case 10: Role Authorization Boundaries

### Steps

1. **Student Cannot Access Instructor Dashboard**
   - Login as student
   - Try to navigate to `/instructor-dashboard`
   - Should redirect to `/dashboard` (RoleRoute guard)
   - Should NOT show instructor content

2. **Instructor Cannot Access Admin Dashboard**
   - Login as instructor
   - Try to navigate to `/admin-dashboard`
   - Should redirect to `/dashboard`
   - Should NOT show admin statistics

3. **Student Cannot Access Instructor API**
   - Login as student
   - Open DevTools → Network
   - In Console, try: `fetch('/api/courses', {headers: {'Authorization': 'Bearer <token>'}})`
   - Should get 403 Forbidden response (backend enforces)

### Expected Result

✅ Frontend guards prevent navigation, backend enforces authorization

---

## Test Case 11: Session Persistence

### Steps

1. **Login as Any User**
   - Complete login to any dashboard

2. **Refresh Page**
   - Press F5 or Ctrl+R
   - Should NOT redirect to login
   - Should remain on dashboard
   - Should NOT lose session

3. **Check sessionStorage**
   - Open DevTools → Application → sessionStorage
   - Should see `learnsphere_token` key with JWT value

4. **Close and Reopen Browser Tab**
   - Close tab (simulates session close)
   - Open new tab, go to http://localhost:5173
   - Should redirect to `/login` (sessionStorage cleared)

### Expected Result

✅ Session persists after refresh, cleared on browser close, restored via `/auth/me`

---

## Test Case 12: Error Handling

### Steps

1. **Network Error During Login**
   - Stop backend server (Ctrl+C)
   - Try to login
   - Should display: "Unable to connect to the server..."
   - Should show error message with retry option

2. **Network Error on Dashboard Load**
   - Login successfully
   - Stop backend server
   - Refresh dashboard
   - Should display error message: "Failed to load dashboard data"
   - Should provide retry option (refresh button)

3. **Expired Token**
   - Login, then wait (or manually delete token from sessionStorage)
   - Try to navigate to protected page
   - Should redirect to `/login`
   - Should prompt re-authentication

### Expected Result

✅ Graceful error handling with user-friendly messages

---

## Test Case 13: Mobile Responsiveness

### Steps

1. **Test on Mobile View**
   - Open DevTools → Device Toolbar
   - Select mobile device (iPhone 12, etc.)

2. **Login Page**
   - Form should stack vertically
   - Input fields should be full width
   - Submit button should be touchable (large enough)

3. **Dashboards on Mobile**
   - Header should collapse to mobile-friendly view
   - Stats grid should stack (1-2 columns max)
   - Navigation should be mobile-optimized
   - Sidebar should collapse or hide

4. **Test Touch Interactions**
   - Links should be easily clickable
   - Buttons should have adequate padding
   - No layout shifts or overflow

### Expected Result

✅ Responsive design works on mobile devices

---

## Test Case 14: Accessibility

### Steps

1. **Keyboard Navigation**
   - Tab through login form: Email → Password → Submit → Register Link
   - Each field should be focusable
   - Focus indicator should be visible

2. **Form Labels**
   - Right-click email input → Inspect
   - Should have `<label htmlFor="email">` associated
   - Label should be readable by screen readers

3. **Color Contrast**
   - Use DevTools accessibility checker
   - All text should meet WCAG AA standard (contrast ratio 4.5:1)
   - Error messages in red should have good contrast

4. **ARIA Attributes**
   - Buttons should have accessible labels
   - Icons should have aria-labels (e.g., show/hide password)
   - Role alerts should be marked with `role="alert"`

### Expected Result

✅ Keyboard navigation works, labels present, contrast meets standards

---

## Test Case 15: Browser Compatibility

### Steps

Test login and dashboard in multiple browsers:

1. **Chrome/Chromium**
   - Should work without issues

2. **Firefox**
   - Should work without issues
   - Session storage should work

3. **Edge**
   - Should work without issues
   - CORS should work

4. **Safari** (if available)
   - Should work without issues

### Expected Result

✅ Works across modern browsers

---

## Regression Testing

### Existing Features Still Work

1. **Course Browsing**
   - Student can still browse courses at `/courses`
   - Enrollment still works

2. **Learning Path**
   - Student can access `/my-learning`
   - Can take quizzes, submit assignments
   - Progress tracking works

3. **Certificates**
   - Student can view `/certificates`
   - Can verify certificates

4. **Notifications**
   - Notifications page `/notifications` still works
   - Notification bell still shows count

5. **Analytics**
   - `/analytics` page still works
   - Displays role-appropriate data

6. **Registration**
   - `/register` still works
   - New users created as students by default

### Expected Result

✅ No existing functionality broken

---

## Performance Testing

### Steps

1. **Dashboard Load Time**
   - Open DevTools → Network tab
   - Navigate to each dashboard
   - Document time until "Interactive" state
   - Should be under 3 seconds

2. **API Response Time**
   - Monitor network requests
   - Each API call should complete in < 1 second
   - No waterfall delays between requests

3. **Data Rendering**
   - Large datasets (100+ enrollments) should render smoothly
   - No layout jank or stuttering
   - Scroll performance should be smooth

### Expected Result

✅ Dashboards load quickly, no performance issues

---

## Security Testing Checklist

- [ ] Login password not logged or echoed
- [ ] JWT token not exposed in URLs or logs
- [ ] API responses don't contain passwords/hashes
- [ ] Role value from backend, not from form input
- [ ] Backend authorization checked for each endpoint
- [ ] CORS properly configured (localhost only in dev)
- [ ] No sensitive data in localStorage
- [ ] Session cleared on logout
- [ ] Expired tokens handled gracefully
- [ ] XSS protection: user inputs sanitized

---

## Deployment Checklist

Before deploying to production:

- [ ] Frontend builds without errors: `npm run build`
- [ ] No console errors or warnings
- [ ] All tests pass
- [ ] Environment variables configured
  - [ ] VITE_API_URL set to production API
  - [ ] JWT_SECRET updated for production
  - [ ] Database credentials correct
  - [ ] CORS origins updated
- [ ] Database migrations applied
- [ ] Backups created
- [ ] Monitoring/logging configured
- [ ] Performance optimized (bundles analyzed)
- [ ] Security review completed
- [ ] Accessibility audit passed

---

## Troubleshooting

### Issue: Login Redirects to `/dashboard` Instead of Role-Specific Dashboard

**Solution:**
- Check browser DevTools → Console for errors
- Verify JWT token in sessionStorage
- Confirm backend returns `user.role` in login response
- Check `Login.jsx` for redirect logic

### Issue: Dashboard Shows "Loading..." Forever

**Solution:**
- Check DevTools → Network for failed API calls
- Verify backend API is running (`http://localhost:5000/api/health`)
- Check CORS configuration
- Look for 401/403 responses (authentication issue)

### Issue: Cannot See Enrolled Courses on Student Dashboard

**Solution:**
- Verify student is enrolled in courses (check DB: `SELECT * FROM enrollments WHERE student_id = ?`)
- Check `/api/enrollments/my` returns data
- Verify enrollment status is 'active'

### Issue: Admin Cannot See Platform Statistics

**Solution:**
- Verify `/api/analytics/overview` returns data
- Check user has admin role in database
- Verify backend `authorize('admin')` middleware on analytics endpoint

### Issue: Logout Doesn't Clear Session

**Solution:**
- Check `sessionStorage.removeItem('learnsphere_token')` is called
- Verify browser allows sessionStorage manipulation
- Check for JavaScript errors in console during logout

---

## Summary

This testing guide covers:
1. ✅ Authentication flow (all three roles)
2. ✅ Login error handling
3. ✅ Dashboard data loading
4. ✅ Navigation and routing
5. ✅ Role authorization boundaries
6. ✅ Session management
7. ✅ Error handling
8. ✅ Mobile responsiveness
9. ✅ Accessibility
10. ✅ Regression testing
11. ✅ Performance testing
12. ✅ Security verification

**Estimated Time:** 1-2 hours for complete manual testing

**Automated Testing:** Can be extended with Cypress or Playwright for end-to-end tests
