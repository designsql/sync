import { warn, fail } from "./log.js";

export interface ExecuteResult {
  total: number;
  success: number;
  skipped: number;
}

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function executePostgres(
  connectionString: string,
  sql: string,
): Promise<ExecuteResult> {
  const pg = await import("pg");
  const client = new pg.default.Client(connectionString);
  await client.connect();

  const statements = splitStatements(sql);
  const result: ExecuteResult = {
    total: statements.length,
    success: 0,
    skipped: 0,
  };

  for (const stmt of statements) {
    try {
      await client.query(stmt);
      result.success++;
    } catch (err: any) {
      // 42P07 = relation already exists
      if (err.code === "42P07" || err.code === "42710") {
        result.skipped++;
        warn(`Skipped (already exists): ${stmt.substring(0, 60)}...`);
      } else {
        result.skipped++;
        warn(`Failed: ${err.message} — ${stmt.substring(0, 60)}...`);
      }
    }
  }

  await client.end();
  return result;
}

async function executeMysql(
  connectionString: string,
  sql: string,
): Promise<ExecuteResult> {
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection(connectionString);

  const statements = splitStatements(sql);
  const result: ExecuteResult = {
    total: statements.length,
    success: 0,
    skipped: 0,
  };

  for (const stmt of statements) {
    try {
      await connection.execute(stmt);
      result.success++;
    } catch (err: any) {
      // ER_TABLE_EXISTS_ERROR = 1050
      if (err.errno === 1050) {
        result.skipped++;
        warn(`Skipped (already exists): ${stmt.substring(0, 60)}...`);
      } else {
        result.skipped++;
        warn(`Failed: ${err.message} — ${stmt.substring(0, 60)}...`);
      }
    }
  }

  await connection.end();
  return result;
}

async function executeMssql(
  connectionString: string,
  sql: string,
): Promise<ExecuteResult> {
  const mssql = await import("mssql");
  const pool = await mssql.default.connect(connectionString);

  const statements = splitStatements(sql);
  const result: ExecuteResult = {
    total: statements.length,
    success: 0,
    skipped: 0,
  };

  for (const stmt of statements) {
    try {
      await pool.request().query(stmt);
      result.success++;
    } catch (err: any) {
      // 2714 = object already exists
      if (err.number === 2714) {
        result.skipped++;
        warn(`Skipped (already exists): ${stmt.substring(0, 60)}...`);
      } else {
        result.skipped++;
        warn(`Failed: ${err.message} — ${stmt.substring(0, 60)}...`);
      }
    }
  }

  await pool.close();
  return result;
}

export async function executeSQL(
  dbType: string,
  connectionString: string,
  sql: string,
): Promise<ExecuteResult> {
  switch (dbType) {
    case "postgres":
      return executePostgres(connectionString, sql);
    case "mysql":
      return executeMysql(connectionString, sql);
    case "mssql":
      return executeMssql(connectionString, sql);
    default:
      fail(
        `Auto-apply is not supported for '${dbType}'. SQL output printed below:`,
      );
      console.log("\n" + sql);
      return { total: 0, success: 0, skipped: 0 };
  }
}
