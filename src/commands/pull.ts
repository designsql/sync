import { exporter } from "@dbml/core";
import { ok, info, fail, warn } from "../utils/log.js";
import { executeSQL } from "../utils/db.js";

const FORMAT_MAP: Record<string, string> = {
  postgres: "postgres",
  mysql: "mysql",
  mssql: "mssql",
};

export async function pull(
  dbType: string,
  connectionString: string,
  token: string,
  projectTag: string,
  apiUrl: string
): Promise<void> {
  info(`Fetching DBML from designsql cloud (tag: ${projectTag})...`);

  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "x-designsql-token": token,
      "x-designsql-tag": projectTag,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    fail(`Server responded with ${response.status}: ${errorText}`);
    process.exit(1);
  }

  const dbmlString = await response.text();
  if (!dbmlString.trim()) {
    fail("Received empty DBML from server");
    process.exit(1);
  }

  ok(`DBML received (${dbmlString.length} chars)`);

  const exportFormat = FORMAT_MAP[dbType];

  if (!exportFormat) {
    // BigQuery, Snowflake — no SQL export support
    info(
      `Auto-apply is not supported for '${dbType}'. Outputting DBML instead:`
    );
    console.log("\n" + dbmlString);
    return;
  }

  info(`Converting DBML to ${exportFormat} SQL...`);
  let sql: string;
  try {
    sql = exporter.export(dbmlString, exportFormat as any);
  } catch (error: any) {
    const message = error instanceof Error
      ? error.message
      : JSON.stringify(error, null, 2);
    fail(`Failed to generate SQL: ${message}`);
    process.exit(1);
  }

  // Fix @dbml/core quoting bug for PostgreSQL types
  if (exportFormat === "postgres") {
    // Replace "TYPE" with TYPE for common quoted types like "VARCHAR(50)", "INT4", etc.
    sql = sql.replace(/"(VARCHAR\(\d+\)|INT[248]|NUMERIC\(\d+(?:,\s*\d+)?\)|TIMESTAMP|TEXT|BOOLEAN|INTEGER|SERIAL|JSONB?|UUID|DATE)"/gi, "$1");
    // Also handle cases like "CHARACTER VARYING" or other common patterns if needed
    sql = sql.replace(/"(CHARACTER VARYING|DOUBLE PRECISION|TIMESTAMP WITH TIME ZONE|TIMESTAMP WITHOUT TIME ZONE)"/gi, "$1");
  }

  if (!sql.trim()) {
    warn("Generated SQL is empty. Check if the DBML contains compatible elements for this database type.");
  }

  ok(`SQL generated (${sql.length} chars)`);

  info(`Applying SQL to ${dbType} database...`);
  const result = await executeSQL(dbType, connectionString, sql);

  console.log("");
  const droppedMsg = result.dropped > 0 ? `, ${result.dropped} table(s) dropped` : "";
  ok(
    `Done! ${result.success} statement(s) applied, ${result.skipped} skipped${droppedMsg} (${result.total} total)`
  );
}
