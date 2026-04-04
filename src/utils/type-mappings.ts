type ReplacementRule = [RegExp, string];

// Target MSSQL: replace all types invalid in MSSQL
const MSSQL_MAPPINGS: ReplacementRule[] = [
  // PostgreSQL alias types
  [/\bint2\b/gi, "SMALLINT"],
  [/\bint4\b/gi, "INT"],
  [/\bint8\b/gi, "BIGINT"],
  [/\bbigserial\b/gi, "BIGINT IDENTITY(1,1)"],
  [/\bserial\b/gi, "INT IDENTITY(1,1)"],

  // Boolean types
  [/\btinyint\(\s*1\s*\)/gi, "BIT"],
  [/\bbool\b/gi, "BIT"],
  [/\bboolean\b/gi, "BIT"],

  // Timestamp types
  [/\btimestamp\s+with\s+time\s+zone\b/gi, "DATETIMEOFFSET"],
  [/\btimestamp\s+without\s+time\s+zone\b/gi, "DATETIME2"],
  [/\btimestamp\b/gi, "DATETIME2"],

  // JSON types
  [/\bjsonb\b/gi, "NVARCHAR(MAX)"],
  [/\bjson\b/gi, "NVARCHAR(MAX)"],

  // UUID
  [/\buuid\b/gi, "UNIQUEIDENTIFIER"],

  // Float/numeric types
  [/\bdouble\s+precision\b/gi, "FLOAT"],
  [/\bdouble\b/gi, "FLOAT"],
  [/\bnumeric\b/gi, "DECIMAL"],

  // MySQL text types
  [/\blongtext\b/gi, "NVARCHAR(MAX)"],
  [/\bmediumtext\b/gi, "NVARCHAR(MAX)"],
  [/\btinytext\b/gi, "NVARCHAR(255)"],
  [/\bmediumint\b/gi, "INT"],

  // MySQL-only text → NVARCHAR(MAX) (MSSQL deprecated text)
  [/\btext\b/gi, "NVARCHAR(MAX)"],

  // MySQL enum/set
  [/\benum\s*\([^)]+\)/gi, "NVARCHAR(255)"],
  [/\bset\s*\([^)]+\)/gi, "NVARCHAR(255)"],
];

// Target PostgreSQL: replace all types invalid in PostgreSQL + fix quoting bug
const POSTGRES_MAPPINGS: ReplacementRule[] = [
  // MySQL text types
  [/\blongtext\b/gi, "TEXT"],
  [/\bmediumtext\b/gi, "TEXT"],
  [/\btinytext\b/gi, "TEXT"],

  // MySQL numeric types
  [/\btinyint\(\s*1\s*\)/gi, "BOOLEAN"],
  [/\bmediumint\b/gi, "INTEGER"],

  // MySQL float/datetime
  [/\bdouble\b(?!\s+precision)/gi, "DOUBLE PRECISION"],
  [/\bdatetime\b/gi, "TIMESTAMP"],

  // MySQL enum/set
  [/\benum\s*\([^)]+\)/gi, "TEXT"],
  [/\bset\s*\([^)]+\)/gi, "TEXT[]"],

  // MSSQL types
  [/\bbit\b(?!\s+varying)/gi, "BOOLEAN"],
  [/\bdatetime2\b/gi, "TIMESTAMP"],
  [/\bdatetimeoffset\b/gi, "TIMESTAMP WITH TIME ZONE"],
  [/\bnvarchar\s*\(\s*max\s*\)/gi, "TEXT"],
  [/\bnvarchar\b/gi, "VARCHAR"],
  [/\buniqueidentifier\b/gi, "UUID"],
  [/\bidentity\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, "GENERATED ALWAYS AS IDENTITY"],
];

// Target MySQL: replace all types invalid in MySQL
const MYSQL_MAPPINGS: ReplacementRule[] = [
  // PostgreSQL types
  [/\bbigserial\b/gi, "BIGINT AUTO_INCREMENT"],
  [/\bserial\b/gi, "INT AUTO_INCREMENT"],
  [/\bjsonb\b/gi, "JSON"],
  [/\buuid\b/gi, "CHAR(36)"],
  [/\bint2\b/gi, "SMALLINT"],
  [/\bint4\b/gi, "INT"],
  [/\bint8\b/gi, "BIGINT"],
  [/\bbool\b/gi, "TINYINT(1)"],
  [/\bboolean\b/gi, "TINYINT(1)"],
  [/\btimestamp\s+with\s+time\s+zone\b/gi, "DATETIME"],
  [/\btimestamp\s+without\s+time\s+zone\b/gi, "DATETIME"],
  [/\bdouble\s+precision\b/gi, "DOUBLE"],

  // MSSQL types
  [/\bbit\b(?!\s+varying)/gi, "TINYINT(1)"],
  [/\bdatetime2\b/gi, "DATETIME"],
  [/\bdatetimeoffset\b/gi, "DATETIME"],
  [/\bnvarchar\s*\(\s*max\s*\)/gi, "LONGTEXT"],
  [/\buniqueidentifier\b/gi, "CHAR(36)"],
  [/\bidentity\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, "AUTO_INCREMENT"],
];

const TARGET_MAPPINGS: Record<string, ReplacementRule[]> = {
  mssql: MSSQL_MAPPINGS,
  postgres: POSTGRES_MAPPINGS,
  mysql: MYSQL_MAPPINGS,
};

export function applyTypeMappings(sql: string, targetDbType: string): string {
  // Fix @dbml/core quoting bug for PostgreSQL:
  // Multi-word types with args get incorrectly quoted, e.g. "character varying(100)"
  if (targetDbType === "postgres") {
    sql = sql.replace(
      /"([a-zA-Z]+(?: [a-zA-Z]+)*\(\d+(?:,\s*\d+)*\))"/g,
      "$1",
    );
  }

  const mappings = TARGET_MAPPINGS[targetDbType];
  if (!mappings) return sql;

  for (const [pattern, replacement] of mappings) {
    sql = sql.replace(pattern, replacement);
  }

  return sql;
}
