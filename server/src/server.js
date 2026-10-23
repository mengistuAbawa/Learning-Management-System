
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { pool, testDatabaseConnection } = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const courseRoutes = require("./routes/courseRoutes");
const moduleRoutes = require("./routes/moduleRoutes");
const lessonRoutes = require("./routes/lessonRoutes");
const enrollmentRoutes = require("./routes/enrollmentRoutes");
const progressRoutes = require("./routes/progressRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const app = express();

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const allowedClientOrigins =
  process.env.NODE_ENV === "production"
    ? CLIENT_URL
    : [
        CLIENT_URL,
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
      ];

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: allowedClientOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/api/health", async (req, res) => {
  try {
    const database = await testDatabaseConnection();

    res.status(200).json({
      success: true,
      message: "LearnSphere LMS API is running",
      database: "connected",
      databaseName: database.database,
      serverTime: database.server_time,
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    res.status(503).json({
      success: false,
      message: "API is running, but the database is unavailable.",
    });
  }
});
app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api", moduleRoutes);
app.use("/api", lessonRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api", assignmentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to LearnSphere LMS API",
    version: "1.0.0",
  });
});


// Authentication endpoints
app.use("/api/auth", authRoutes);

// Keep the 404 handler after all valid routes.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Central error handler
app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    message: "An unexpected server error occurred.",
  });
});

async function startServer() {
  try {
    await testDatabaseConnection();

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error(
        "JWT_SECRET must be set to a random secret of at least 32 characters."
      );
    }

    const server = app.listen(PORT, () => {
      console.log(`LearnSphere LMS API: http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`Authentication API: http://localhost:${PORT}/api/auth`);
      console.log("PostgreSQL connection successful.");
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `Port ${PORT} is already in use. Stop the process using it or set PORT to an available port in server/.env.`
        );
      } else {
        console.error("Failed to start LearnSphere LMS:", error.message);
      }

      process.exitCode = 1;
      pool.end().catch((closeError) => {
        console.error("Database pool shutdown error:", closeError.message);
      });
    });

    let shuttingDown = false;

    async function shutdown(signal) {
      if (shuttingDown) return;
      shuttingDown = true;

      console.log(`${signal} received. Shutting down...`);

      server.close(async () => {
        try {
          await pool.end();
          process.exit(0);
        } catch (error) {
          console.error("Shutdown error:", error.message);
          process.exit(1);
        }
      });
    }

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("Failed to start LearnSphere LMS:", error.message);

    await pool.end().catch(() => {});
    process.exitCode = 1;
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
