import { exporter } from "@dbml/core";
import { ok, info, fail } from "../utils/log.js";
import { executeSQL } from "../utils/db.js";

const FORMAT_MAP: Record<string, string> = {
  postgres: "postgresql",
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
  const sql = exporter.export(dbmlString, exportFormat);
  ok(`SQL generated (${sql.length} chars)`);

  info(`Applying SQL to ${dbType} database...`);
  const result = await executeSQL(dbType, connectionString, sql);

  console.log("");
  ok(
    `Done! ${result.success} statement(s) applied, ${result.skipped} skipped, ${result.total} total`
  );
}
