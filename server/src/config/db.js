
const { Pool } = require("pg");
require("dotenv").config();

function getPoolConfig() {
  const sharedOptions = {
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 10,
  };
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const connectionUrl = new URL(databaseUrl);
    for (const option of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) {
      connectionUrl.searchParams.delete(option);
    }

    return {
      ...sharedOptions,
      connectionString: connectionUrl.toString(),
      ssl: { rejectUnauthorized: true },
    };
  }

  return {
    ...sharedOptions,
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "learnsphere_lms",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD,
  };
}

const pool = new Pool(getPoolConfig());

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

async function testDatabaseConnection() {
  const result = await pool.query(
    "SELECT current_database() AS database, NOW() AS server_time"
  );

  return result.rows[0];
}

module.exports = {
  pool,
  testDatabaseConnection,
};
