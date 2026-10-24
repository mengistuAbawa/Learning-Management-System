const { Pool } = require("pg");
require("dotenv").config({ path: "./server/.env" });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function verify() {
  try {
    console.log("\n📊 Schema Verification Report\n");

    // Quiz Attempts
    const qa = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name='quiz_attempts' AND column_name IN ('status','attempt_number','total_points')`
    );
    console.log("✓ quiz_attempts columns:", qa.rows.map((r) => r.column_name));

    // Assignments
    const a = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name='assignments' AND column_name='is_published'`
    );
    console.log("✓ assignments.is_published:", a.rows.length > 0 ? "EXISTS" : "MISSING");

    // Lessons
    const l = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name='lessons' AND column_name='is_required'`
    );
    console.log("✓ lessons.is_required:", l.rows.length > 0 ? "EXISTS" : "MISSING");

    // Quizzes
    const q = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name='quizzes' AND column_name='max_attempts'`
    );
    console.log("✓ quizzes.max_attempts:", q.rows.length > 0 ? "EXISTS" : "MISSING");

    console.log("\n✅ Migration applied successfully!\n");
    process.exit(0);
  } catch (e) {
    console.error("❌ Error:", e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verify();
