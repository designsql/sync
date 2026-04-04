import { warn, fail, ok } from "./log.js";

export interface ExecuteResult {
  total: number;
  success: number;
  skipped: number;
  dropped: number;
}

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Split MSSQL SQL that uses GO as batch separator (@dbml/core export format).
 * Falls back to semicolon splitting if no GO separators are found.
 */
function splitStatementsMssql(sql: string): string[] {
  // Check if the SQL uses GO as batch separator
  if (/^GO\s*$/m.test(sql)) {
    return sql
      .split(/^GO\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  // Fallback to semicolon splitting
  return splitStatements(sql);
}

function splitByComma(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function extractCloudTables(sql: string): { schema: string; table: string }[] {
  return splitStatements(sql)
    .map(parseCreateTable)
    .filter((p): p is NonNullable<ReturnType<typeof parseCreateTable>> => p !== null)
    .map(({ schema, table }) => ({ schema: schema ?? "public", table }));
}

function parseCreateTable(stmt: string): {
  schema: string | null;
  table: string;
  columns: { name: string; definition: string }[];
} | null {
  const tableMatch = stmt.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`]?(\w+)["`]?\.["`]?(\w+)["`]?|["`]?(\w+)["`]?)\s*\(/is,
  );
  if (!tableMatch) return null;

  const schema = tableMatch[1] ?? null;
  const table = tableMatch[2] ?? tableMatch[3];

  const parenStart = stmt.indexOf("(");
  const parenEnd = stmt.lastIndexOf(")");
  if (parenStart === -1 || parenEnd === -1) return null;

  const body = stmt.slice(parenStart + 1, parenEnd);
  const parts = splitByComma(body);

  const columns: { name: string; definition: string }[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)/i.test(trimmed))
      continue;
    const colMatch = trimmed.match(/^(?:["`]?(\w+)["`]?)\s+(.+)$/is);
    if (colMatch) {
      // Strip inline REFERENCES — not supported in ALTER TABLE ADD COLUMN
      const def = colMatch[2].trim().replace(/\s+REFERENCES\s+\S+\s*\([^)]+\)/gi, "");
      columns.push({ name: colMatch[1], definition: def });
    }
  }

  return { schema, table, columns };
}

async function tryAddColumns(client: any, stmt: string): Promise<number> {
  const parsed = parseCreateTable(stmt);
  if (!parsed) return 0;

  const { schema, table, columns } = parsed;
  const fullTable = schema ? `"${schema}"."${table}"` : `"${table}"`;

  let added = 0;
  for (const col of columns) {
    try {
      await client.query(
        `ALTER TABLE ${fullTable} ADD COLUMN IF NOT EXISTS "${col.name}" ${col.definition}`,
      );
      added++;
    } catch {
      // column type incompatible or other constraint — skip silently
    }
  }
  return added;
}

async function tryAddColumnsMysql(
  connection: any,
  stmt: string,
  dbName: string,
): Promise<number> {
  const parsed = parseCreateTable(stmt);
  if (!parsed) return 0;

  const { table, columns } = parsed;

  let added = 0;
  for (const col of columns) {
    try {
      const [rows] = (await connection.execute(
        `SELECT COUNT(*) as count FROM information_schema.columns 
         WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
        [dbName, table, col.name],
      )) as any;

      if (rows[0].count === 0) {
        await connection.execute(
          `ALTER TABLE \`${table}\` ADD COLUMN \`${col.name}\` ${col.definition}`,
        );
        added++;
      }
    } catch {
      // skip
    }
  }
  return added;
}

async function tryAddColumnsMssql(pool: any, stmt: string): Promise<number> {
  const parsed = parseCreateTable(stmt);
  if (!parsed) return 0;

  const { table, columns } = parsed;

  let added = 0;
  for (const col of columns) {
    try {
      const checkSql = `
        IF NOT EXISTS (
          SELECT * FROM sys.columns 
          WHERE object_id = OBJECT_ID(N'[${table}]') 
          AND name = N'${col.name}'
        )
        BEGIN
          ALTER TABLE [${table}] ADD [${col.name}] ${col.definition}
        END
      `;
      await pool.request().query(checkSql);
      // We don't know for sure if it was added or existed, 
      // but in the context of patching, we count any successful batch
      added++;
    } catch {
      // skip
    }
  }
  return added;
}

async function executePostgres(
  connectionString: string,
  sql: string,
): Promise<ExecuteResult> {
  const pg = await import("pg");
  const client = new pg.default.Client(connectionString);
  await client.connect();

  const cloudTables = extractCloudTables(sql);
  const cloudSchemas = [...new Set(cloudTables.map((t) => t.schema))];

  const result: ExecuteResult = {
    total: 0,
    success: 0,
    skipped: 0,
    dropped: 0,
  };

  // Drop local tables that are not in the cloud schema
  if (cloudSchemas.length > 0) {
    const { rows } = await client.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema = ANY($1)`,
      [cloudSchemas],
    );

    for (const row of rows) {
      const inCloud = cloudTables.some(
        (t) => t.schema === row.table_schema && t.table === row.table_name,
      );
      if (!inCloud) {
        await client.query(
          `DROP TABLE IF EXISTS "${row.table_schema}"."${row.table_name}" CASCADE`,
        );
        warn(`Dropped (not in cloud): "${row.table_schema}"."${row.table_name}"`);
        result.dropped++;
      }
    }
  }

  // Create or patch tables from cloud schema
  const statements = splitStatements(sql);
  result.total = statements.length;

  for (const stmt of statements) {
    try {
      await client.query(stmt);
      result.success++;
    } catch (err: any) {
      // 42P07 = relation already exists
      if (err.code === "42P07" || err.code === "42710") {
        const added = await tryAddColumns(client, stmt);
        if (added > 0) {
          ok(`Patched existing table — ${added} column(s) added: ${stmt.substring(0, 60)}...`);
          result.success++;
        } else {
          result.skipped++;
          warn(`Skipped (already exists, no new columns): ${stmt.substring(0, 60)}...`);
        }
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

  // Get current DB name
  const [dbRows] = (await connection.execute("SELECT DATABASE() as db")) as any;
  const dbName = dbRows[0].db;

  const cloudTables = extractCloudTables(sql);
  const result: ExecuteResult = {
    total: 0,
    success: 0,
    skipped: 0,
    dropped: 0,
  };

  if (dbName) {
    const [rows] = (await connection.execute(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
      [dbName],
    )) as any;

    for (const row of rows) {
      const inCloud = cloudTables.some((t) => t.table === row.table_name);
      if (!inCloud) {
        await connection.execute(`DROP TABLE IF EXISTS \`${row.table_name}\``);
        warn(`Dropped (not in cloud): \`${row.table_name}\``);
        result.dropped++;
      }
    }
  }

  const statements = splitStatements(sql);
  result.total = statements.length;

  for (const stmt of statements) {
    try {
      await connection.execute(stmt);
      result.success++;
    } catch (err: any) {
      // ER_TABLE_EXISTS_ERROR = 1050
      if (err.errno === 1050) {
        const added = await tryAddColumnsMysql(connection, stmt, dbName);
        if (added > 0) {
          ok(`Patched existing table — ${added} column(s) added: ${stmt.substring(0, 60)}...`);
          result.success++;
        } else {
          result.skipped++;
          warn(`Skipped (already exists, no new columns): ${stmt.substring(0, 60)}...`);
        }
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

  const cloudTables = extractCloudTables(sql);
  const result: ExecuteResult = {
    total: 0,
    success: 0,
    skipped: 0,
    dropped: 0,
  };

  // Drop tables not in cloud
  // MSSQL doesn't support CASCADE — must drop FK constraints first
  const { recordset: rows } = await pool.request().query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_catalog = DB_NAME() AND table_type = 'BASE TABLE' AND table_schema = 'dbo'
  `);

  const tablesToDrop = rows.filter(
    (row: any) => !cloudTables.some((t) => t.table === row.table_name)
  );

  // First pass: drop all FK constraints referencing tables we want to drop
  for (const row of tablesToDrop) {
    const { recordset: fks } = await pool.request().query(`
      SELECT fk.name AS fk_name, OBJECT_NAME(fk.parent_object_id) AS source_table
      FROM sys.foreign_keys fk
      WHERE OBJECT_NAME(fk.referenced_object_id) = '${row.table_name}'
    `);
    for (const fk of fks) {
      await pool.request().query(`ALTER TABLE [${fk.source_table}] DROP CONSTRAINT [${fk.fk_name}]`);
    }
  }

  // Second pass: drop the tables
  for (const row of tablesToDrop) {
    try {
      await pool.request().query(`DROP TABLE [${row.table_name}]`);
      warn(`Dropped (not in cloud): [${row.table_name}]`);
      result.dropped++;
    } catch (err: any) {
      warn(`Failed to drop [${row.table_name}]: ${err.message}`);
    }
  }

  const statements = splitStatementsMssql(sql);
  result.total = statements.length;

  for (const stmt of statements) {
    try {
      await pool.request().query(stmt);
      result.success++;
    } catch (err: any) {
      // 2714 = object already exists
      if (err.number === 2714) {
        const added = await tryAddColumnsMssql(pool, stmt);
        if (added > 0) {
          ok(`Patched existing table — columns checked/added: ${stmt.substring(0, 60)}...`);
          result.success++;
        } else {
          result.skipped++;
          warn(`Skipped (already exists): ${stmt.substring(0, 60)}...`);
        }
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
      return { total: 0, success: 0, skipped: 0, dropped: 0 };
  }
}
