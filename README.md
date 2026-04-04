# @designsql/sync

CLI tool to sync database schemas with designsql cloud.

## Installation

```bash
npm install -g @designsql/sync
```

## Usage

```bash
designsql <database-type> <connection-string> <command> <token> [project-tag]
```

### Parameters

| Parameter           | Position | Description                                                          |
| ------------------- | -------- | -------------------------------------------------------------------- |
| `database-type`     | 1        | Database type: `postgres`, `mysql`, `mssql` (bigquery, snowflake coming soon) |
| `connection-string` | 2        | Standard database connection URL                                     |
| `command`           | 3        | `push` or `pull`                                                     |
| `token`             | 4        | Sync token from designsql project settings                           |
| `project-tag`       | 5        | Tag name (default: `"main"`)                                         |

### Push — Send local schema to designsql cloud

Extracts your database schema, converts it to DBML, and uploads it.

```bash
designsql postgres postgresql://user:pass@localhost/mydb push tok_abc123
designsql mysql mysql://user:pass@localhost/mydb push tok_abc123 v2
```

```
[..] Connecting to postgres database...
[OK] Schema extracted — 12 table(s) found
[..] Converting schema to DBML...
[OK] DBML generated (3842 chars)
[..] Pushing DBML to designsql cloud...
[OK] Push complete! Tag: main (tag-id-here)
```

### Pull — Fetch schema from cloud and apply to local database

Downloads DBML from designsql cloud, converts it to SQL DDL, and applies it directly to your database.

```bash
designsql postgres postgresql://user:pass@localhost/mydb pull tok_abc123
designsql mysql mysql://user:pass@localhost/mydb pull tok_abc123 v2
```

```
[..] Fetching DBML from designsql cloud (tag: main)...
[OK] DBML received (3842 chars)
[..] Converting DBML to postgresql SQL...
[OK] SQL generated (2100 chars)
[..] Applying SQL to postgres database...

[OK] Done! 12 statement(s) applied, 0 skipped, 12 total
```

> [!WARNING]
> **Version 2.0.0+ Sync Behavior:**
> Starting from version 2.0.0, the `pull` command performs active synchronization for **PostgreSQL, MySQL, and MSSQL**:
> - **Auto-Patching**: It will automatically add missing columns to existing tables if they are present in the designsql cloud schema.
> - **Auto-Drop**: It will **DROP** any local tables that are NOT found in the designsql cloud schema.
> Use with caution on production databases.

Statements that fail (e.g. table already exists) are skipped with a warning — the rest continue to apply.

## Supported Databases

| Database   | Push (extract schema) | Pull (auto-apply SQL) |
| ---------- | --------------------- | --------------------- |
| PostgreSQL | Yes                   | Yes                   |
| MySQL      | Yes                   | Yes                   |
| MSSQL      | Yes                   | Yes                   |
<!-- | BigQuery   | Yes                   | Output DBML only      |
| Snowflake  | Yes                   | Output DBML only      | -->

## License

MIT
