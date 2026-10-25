const express = require("express");
const { authenticate, authorize } = require("../middleware/auth");
const controller = require("../controllers/adminDashboardController");

const router = express.Router();

router.use(authenticate, authorize("admin"));
router.get("/overview", controller.getOverview);
router.get("/analytics", controller.getAnalytics);
router.get("/approvals", controller.getPendingApprovals);
router.get("/people/:role", controller.getPeople);
router.get("/courses", controller.getCourses);
router.get("/enrollments", controller.getEnrollments);

module.exports = router;
