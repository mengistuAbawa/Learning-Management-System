
const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/auth");
const {
  getOverview,
  getInstructorStudentPerformance,
} = require("../controllers/analyticsController");

router.use(authenticate);

router.get("/overview", getOverview);
router.get("/students", getInstructorStudentPerformance);

module.exports = router;
