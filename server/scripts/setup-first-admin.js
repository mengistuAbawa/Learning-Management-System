const bcrypt = require("bcryptjs");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { pool } = require("../src/config/db");

const SALT_ROUNDS = 12;
const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u;

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
      reject(new Error("Run this setup from an interactive terminal."));
      return;
    }

    let value = "";
    stdout.write(prompt);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();

    function finish(error) {
      stdin.removeListener("data", handleInput);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");

      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }

    function handleInput(input) {
      for (const character of input) {
        if (character === "\u0003") {
          finish(new Error("Setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
          stdout.write("\b \b");
          continue;
        }
        value += character;
        stdout.write("*");
      }
    }

    stdin.on("data", handleInput);
  });
}

async function promptForAccount() {
  const interface_ = readline.createInterface({ input: stdin, output: stdout });

  try {
    const fullName = (await interface_.question("Administrator full name: ")).trim();
    const email = (await interface_.question("Administrator email: "))
      .trim()
      .toLowerCase();

    if (
      fullName.length < 2 ||
      fullName.length > 150 ||
      !NAME_PATTERN.test(fullName)
    ) {
      throw new Error("Enter a valid name between 2 and 150 characters.");
    }

    if (
      email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new Error("Enter a valid email address.");
    }

    return { fullName, email };
  } finally {
    interface_.close();
  }
}

async function main() {
  let client;
  let transactionOpen = false;

  try {
    const { fullName, email } = await promptForAccount();
    const password = await readHidden("Password: ");
    const confirmation = await readHidden("Confirm password: ");

    if (!PASSWORD_PATTERN.test(password)) {
      throw new Error(
        "Password must have 8–128 characters, including uppercase, lowercase, a number, and a symbol."
      );
    }

    if (password !== confirmation) {
      throw new Error("The passwords do not match.");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;

    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [19769, 1]);
    await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");

    const existingAdmin = await client.query(
      "SELECT EXISTS (SELECT 1 FROM users WHERE role = 'admin') AS exists"
    );

    if (existingAdmin.rows[0].exists) {
      throw new Error(
        "An administrator already exists. Use the authorized account-management workflow."
      );
    }

    const existingEmail = await client.query(
      "SELECT EXISTS (SELECT 1 FROM users WHERE LOWER(email) = $1) AS exists",
      [email]
    );

    if (existingEmail.rows[0].exists) {
      throw new Error(
        "That email is already in use. Choose another email address."
      );
    }

    await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')`,
      [fullName, email, passwordHash]
    );
    await client.query("COMMIT");
    transactionOpen = false;

    console.log(
      "First administrator created. Sign in at http://localhost:5173/login."
    );
  } catch (error) {
    if (transactionOpen && client) {
      await client.query("ROLLBACK");
      transactionOpen = false;
    }

    console.error("First-administrator setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
