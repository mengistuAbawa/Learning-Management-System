require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { pool } = require("../src/config/db");

async function main() {
  const migrationsDirectory = path.resolve(
    __dirname,
    "..",
    "..",
    "database",
    "migrations"
  );

  try {
    for (const migrationFile of [
      "20261024_live_classes.sql",
      "20261025_live_classroom_collaboration.sql",
    ]) {
      const migration = await fs.readFile(
        path.join(migrationsDirectory, migrationFile),
        "utf8"
      );
      await pool.query(migration);
    }

    const result = await pool.query(
      `SELECT COUNT(*)::int AS column_count
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'live_classes'`
    );
    if (result.rows[0].column_count < 16) {
      throw new Error("Live class migration verification failed.");
    }

    console.log("Live classroom and collaboration schema is installed and verified.");
  } catch (error) {
    console.error("Live class migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
