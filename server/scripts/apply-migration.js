#!/usr/bin/env node
/**
 * Script to apply database migrations
 * Usage: node scripts/apply-migration.js <migration-file>
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { pool } = require("../src/config/db");

async function applyMigration(migrationPath) {
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf8");

  console.log(`📝 Applying migration: ${path.basename(migrationPath)}`);
  console.log("═".repeat(60));

  try {
    await pool.query("BEGIN");
    console.log("✓ Transaction started");

    // Execute the migration SQL
    const result = await pool.query(sql);
    console.log("✓ Migration SQL executed");

    await pool.query("COMMIT");
    console.log("✓ Transaction committed");

    console.log("═".repeat(60));
    console.log("✅ Migration applied successfully!");
    process.exit(0);
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error("═".repeat(60));
    console.error("❌ Migration failed!");
    console.error("Error:", error.message);
    console.error("═".repeat(60));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Get migration file from command line argument
const migrationFile =
  process.argv[2] ||
  path.join(__dirname, "../database/migrations/20261024_analytics_schema_corrections.sql");

applyMigration(migrationFile);
