#!/usr/bin/env node

import { push } from "./commands/push.js";
import { pull } from "./commands/pull.js";
import { fail } from "./utils/log.js";

const SUPPORTED_DB_TYPES = [
  "postgres",
  "mysql",
  "mssql",
  "bigquery",
  "snowflake",
];
const SUPPORTED_COMMANDS = ["push", "pull"];

function printUsage() {
  console.log(`
@designsql/sync — Sync database schemas with designsql cloud

Usage:
  designsql <database-type> <connection-string> <command> <token> [project-tag]

Database types:
  postgres, mysql, mssql

Commands:
  push    Extract local DB schema and push to designsql cloud
  pull    Fetch schema from designsql cloud and apply to local DB

Arguments:
  database-type      Database type (see above)
  connection-string  Database connection URL
  command            push or pull
  token              Sync token from designsql project settings
  project-tag        Tag name (default: "main")

Examples:
  designsql postgres postgresql://user:pass@localhost/mydb push tok_abc123
  designsql mysql mysql://user:pass@localhost/mydb pull tok_xyz789 v2
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const [dbType, connectionString, command, token, projectTag = "main"] = args;

  if (!dbType || !connectionString || !command || !token) {
    fail("Missing required arguments");
    printUsage();
    process.exit(1);
  }

  if (!SUPPORTED_DB_TYPES.includes(dbType)) {
    fail(
      `Unsupported database type: '${dbType}'. Supported: ${SUPPORTED_DB_TYPES.join(", ")}`,
    );
    process.exit(1);
  }

  if (!SUPPORTED_COMMANDS.includes(command)) {
    fail(`Unknown command: '${command}'. Use 'push' or 'pull'.`);
    process.exit(1);
  }

  const apiUrl = "https://api.designsql.cloud/api/sync";

  try {
    if (command === "push") {
      await push(dbType, connectionString, token, projectTag, apiUrl);
    } else {
      await pull(dbType, connectionString, token, projectTag, apiUrl);
    }
  } catch (error: unknown) {
    let message: string;
    if (error instanceof Error) {
      message = typeof error.message === "string" ? error.message : JSON.stringify(error.message);
    } else if (typeof error === "object" && error !== null) {
      try {
        message = JSON.stringify(error, null, 2);
      } catch {
        message = String(error);
      }
    } else {
      message = String(error);
    }
    fail(message);
    process.exit(1);
  }
}

main();
