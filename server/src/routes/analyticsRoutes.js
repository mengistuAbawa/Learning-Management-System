
const express = require("express");
const router = express.Router();

const { authenticate, authorize } = require("../middleware/auth");
const {
  getOverview,
  getAdminOverview,
  getInstructorStudentPerformance,
  getInstructorCalendar,
} = require("../controllers/analyticsController");

router.use(authenticate);

router.get("/overview", getOverview);
router.get("/calendar", getInstructorCalendar);
router.get("/admin/overview", authorize("admin"), getAdminOverview);
router.get("/students", getInstructorStudentPerformance);

module.exports = router;
