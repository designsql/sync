import { describe, it, expect } from "vitest";
import { applyTypeMappings } from "./type-mappings.js";

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Wrap a single type string in a CREATE TABLE to simulate real SQL context */
function col(type: string): string {
  return `[col] ${type}`;
}

function expectType(input: string, target: string, expected: string) {
  const result = applyTypeMappings(col(input), target);
  expect(result).toBe(col(expected));
}

// ─── Target: MSSQL ───────────────────────────────────────────────────────────

describe("applyTypeMappings → mssql", () => {
  const t = "mssql";

  describe("PostgreSQL alias types", () => {
    it("int2 → SMALLINT", () => expectType("int2", t, "SMALLINT"));
    it("int4 → INT", () => expectType("int4", t, "INT"));
    it("int8 → BIGINT", () => expectType("int8", t, "BIGINT"));
    it("serial → INT IDENTITY(1,1)", () =>
      expectType("serial", t, "INT IDENTITY(1,1)"));
    it("bigserial → BIGINT IDENTITY(1,1)", () =>
      expectType("bigserial", t, "BIGINT IDENTITY(1,1)"));
  });

  describe("boolean types", () => {
    it("bool → BIT", () => expectType("bool", t, "BIT"));
    it("boolean → BIT", () => expectType("boolean", t, "BIT"));
    it("tinyint(1) → BIT", () => expectType("tinyint(1)", t, "BIT"));
    it("tinyint( 1 ) → BIT (spaces)", () =>
      expectType("tinyint( 1 )", t, "BIT"));
  });

  describe("timestamp types", () => {
    it("timestamp → DATETIME2", () => expectType("timestamp", t, "DATETIME2"));
    it("timestamp with time zone → DATETIMEOFFSET", () =>
      expectType("timestamp with time zone", t, "DATETIMEOFFSET"));
    it("timestamp without time zone → DATETIME2", () =>
      expectType("timestamp without time zone", t, "DATETIME2"));
  });

  describe("JSON types", () => {
    it("json → NVARCHAR(MAX)", () => expectType("json", t, "NVARCHAR(MAX)"));
    it("jsonb → NVARCHAR(MAX)", () => expectType("jsonb", t, "NVARCHAR(MAX)"));
  });

  describe("UUID", () => {
    it("uuid → UNIQUEIDENTIFIER", () =>
      expectType("uuid", t, "UNIQUEIDENTIFIER"));
  });

  describe("float/numeric types", () => {
    it("double precision → FLOAT", () =>
      expectType("double precision", t, "FLOAT"));
    it("double → FLOAT", () => expectType("double", t, "FLOAT"));
    it("numeric → DECIMAL", () => expectType("numeric", t, "DECIMAL"));
    it("numeric(10,2) → DECIMAL(10,2)", () =>
      expectType("numeric(10,2)", t, "DECIMAL(10,2)"));
  });

  describe("MySQL text types", () => {
    it("longtext → NVARCHAR(MAX)", () =>
      expectType("longtext", t, "NVARCHAR(MAX)"));
    it("mediumtext → NVARCHAR(MAX)", () =>
      expectType("mediumtext", t, "NVARCHAR(MAX)"));
    it("tinytext → NVARCHAR(255)", () =>
      expectType("tinytext", t, "NVARCHAR(255)"));
    it("mediumint → INT", () => expectType("mediumint", t, "INT"));
    it("text → NVARCHAR(MAX)", () => expectType("text", t, "NVARCHAR(MAX)"));
  });

  describe("MySQL enum/set", () => {
    it("enum('a','b','c') → NVARCHAR(255)", () =>
      expectType("enum('a','b','c')", t, "NVARCHAR(255)"));
    it("set('x','y') → NVARCHAR(255)", () =>
      expectType("set('x','y')", t, "NVARCHAR(255)"));
  });

  describe("case insensitivity", () => {
    it("BOOLEAN → BIT", () => expectType("BOOLEAN", t, "BIT"));
    it("UUID → UNIQUEIDENTIFIER", () =>
      expectType("UUID", t, "UNIQUEIDENTIFIER"));
    it("Jsonb → NVARCHAR(MAX)", () =>
      expectType("Jsonb", t, "NVARCHAR(MAX)"));
  });

  describe("word boundary safety", () => {
    it("does not replace 'int2' inside 'point2d'", () => {
      const sql = "[col] point2d";
      expect(applyTypeMappings(sql, t)).toBe("[col] point2d");
    });
    it("does not replace 'text' inside 'textual'", () => {
      const sql = "[col] textual";
      expect(applyTypeMappings(sql, t)).toBe("[col] textual");
    });
    it("does not replace 'serial' inside 'serializable'", () => {
      const sql = "[col] serializable";
      expect(applyTypeMappings(sql, t)).toBe("[col] serializable");
    });
  });
});

// ─── Target: PostgreSQL ──────────────────────────────────────────────────────

describe("applyTypeMappings → postgres", () => {
  const t = "postgres";

  describe("quoting bug fix", () => {
    it('unquotes "character varying(100)"', () => {
      const sql = `"col" "character varying(100)"`;
      const result = applyTypeMappings(sql, t);
      expect(result).toBe(`"col" character varying(100)`);
    });
    it('unquotes "bit varying(10)"', () => {
      const sql = `"col" "bit varying(10)"`;
      const result = applyTypeMappings(sql, t);
      expect(result).toBe(`"col" bit varying(10)`);
    });
    it('unquotes "national character varying(50)"', () => {
      const sql = `"col" "national character varying(50)"`;
      const result = applyTypeMappings(sql, t);
      expect(result).toBe(`"col" national character varying(50)`);
    });
    it('unquotes "national character(10)"', () => {
      const sql = `"col" "national character(10)"`;
      const result = applyTypeMappings(sql, t);
      expect(result).toBe(`"col" national character(10)`);
    });
    it("does not unquote column names", () => {
      const sql = `"my_column" varchar(255)`;
      const result = applyTypeMappings(sql, t);
      expect(result).toBe(`"my_column" varchar(255)`);
    });
    it("does not unquote table names", () => {
      const sql = `CREATE TABLE "users" (\n  "id" int\n);`;
      const result = applyTypeMappings(sql, t);
      expect(result).toContain(`"users"`);
      expect(result).toContain(`"id"`);
    });
    it('handles multi-arg "numeric(10, 2)"', () => {
      const sql = `"col" "numeric(10, 2)"`;
      const result = applyTypeMappings(sql, t);
      expect(result).toBe(`"col" numeric(10, 2)`);
    });
  });

  describe("MySQL text types", () => {
    it("longtext → TEXT", () => expectType("longtext", t, "TEXT"));
    it("mediumtext → TEXT", () => expectType("mediumtext", t, "TEXT"));
    it("tinytext → TEXT", () => expectType("tinytext", t, "TEXT"));
  });

  describe("MySQL numeric types", () => {
    it("tinyint(1) → BOOLEAN", () => expectType("tinyint(1)", t, "BOOLEAN"));
    it("mediumint → INTEGER", () => expectType("mediumint", t, "INTEGER"));
  });

  describe("MySQL float/datetime", () => {
    it("double → DOUBLE PRECISION", () =>
      expectType("double", t, "DOUBLE PRECISION"));
    it("double precision stays double precision", () => {
      const sql = `"col" double precision`;
      const result = applyTypeMappings(sql, t);
      // should NOT become "DOUBLE PRECISION precision"
      expect(result).toBe(`"col" double precision`);
    });
    it("datetime → TIMESTAMP", () => expectType("datetime", t, "TIMESTAMP"));
  });

  describe("MySQL enum/set", () => {
    it("enum('active','inactive') → TEXT", () =>
      expectType("enum('active','inactive')", t, "TEXT"));
    it("set('a','b','c') → TEXT[]", () =>
      expectType("set('a','b','c')", t, "TEXT[]"));
  });

  describe("MSSQL types", () => {
    it("bit → BOOLEAN", () => expectType("bit", t, "BOOLEAN"));
    it("datetime2 → TIMESTAMP", () => expectType("datetime2", t, "TIMESTAMP"));
    it("datetimeoffset → TIMESTAMP WITH TIME ZONE", () =>
      expectType("datetimeoffset", t, "TIMESTAMP WITH TIME ZONE"));
    it("nvarchar(max) → TEXT", () => expectType("nvarchar(max)", t, "TEXT"));
    it("nvarchar(255) → VARCHAR(255)", () =>
      expectType("nvarchar(255)", t, "VARCHAR(255)"));
    it("uniqueidentifier → UUID", () =>
      expectType("uniqueidentifier", t, "UUID"));
    it("identity(1,1) → GENERATED ALWAYS AS IDENTITY", () =>
      expectType("identity(1,1)", t, "GENERATED ALWAYS AS IDENTITY"));
    it("identity(1, 1) with spaces → GENERATED ALWAYS AS IDENTITY", () =>
      expectType("identity(1, 1)", t, "GENERATED ALWAYS AS IDENTITY"));
  });
});

// ─── Target: MySQL ───────────────────────────────────────────────────────────

describe("applyTypeMappings → mysql", () => {
  const t = "mysql";

  describe("PostgreSQL types", () => {
    it("serial → INT AUTO_INCREMENT", () =>
      expectType("serial", t, "INT AUTO_INCREMENT"));
    it("bigserial → BIGINT AUTO_INCREMENT", () =>
      expectType("bigserial", t, "BIGINT AUTO_INCREMENT"));
    it("jsonb → JSON", () => expectType("jsonb", t, "JSON"));
    it("uuid → CHAR(36)", () => expectType("uuid", t, "CHAR(36)"));
    it("int2 → SMALLINT", () => expectType("int2", t, "SMALLINT"));
    it("int4 → INT", () => expectType("int4", t, "INT"));
    it("int8 → BIGINT", () => expectType("int8", t, "BIGINT"));
    it("bool → TINYINT(1)", () => expectType("bool", t, "TINYINT(1)"));
    it("boolean → TINYINT(1)", () => expectType("boolean", t, "TINYINT(1)"));
    it("timestamp with time zone → DATETIME", () =>
      expectType("timestamp with time zone", t, "DATETIME"));
    it("timestamp without time zone → DATETIME", () =>
      expectType("timestamp without time zone", t, "DATETIME"));
    it("double precision → DOUBLE", () =>
      expectType("double precision", t, "DOUBLE"));
  });

  describe("MSSQL types", () => {
    it("bit → TINYINT(1)", () => expectType("bit", t, "TINYINT(1)"));
    it("datetime2 → DATETIME", () => expectType("datetime2", t, "DATETIME"));
    it("datetimeoffset → DATETIME", () =>
      expectType("datetimeoffset", t, "DATETIME"));
    it("nvarchar(max) → LONGTEXT", () =>
      expectType("nvarchar(max)", t, "LONGTEXT"));
    it("uniqueidentifier → CHAR(36)", () =>
      expectType("uniqueidentifier", t, "CHAR(36)"));
    it("identity(1,1) → AUTO_INCREMENT", () =>
      expectType("identity(1,1)", t, "AUTO_INCREMENT"));
  });
});

// ─── Unsupported / unknown target ────────────────────────────────────────────

describe("applyTypeMappings → unknown target", () => {
  it("returns SQL unchanged for bigquery", () => {
    const sql = "CREATE TABLE t (id serial, data jsonb)";
    expect(applyTypeMappings(sql, "bigquery")).toBe(sql);
  });

  it("returns SQL unchanged for snowflake", () => {
    const sql = "CREATE TABLE t (id int, name text)";
    expect(applyTypeMappings(sql, "snowflake")).toBe(sql);
  });

  it("does not apply quoting fix for non-postgres targets", () => {
    const sql = `"col" "character varying(100)"`;
    expect(applyTypeMappings(sql, "mssql")).toBe(`"col" "character varying(100)"`);
  });
});

// ─── Integration: full CREATE TABLE statements ──────────────────────────────

describe("integration: full SQL statements", () => {
  it("MySQL schema → MSSQL target", () => {
    const sql = `CREATE TABLE [products] (
  [id] int PRIMARY KEY IDENTITY(1, 1),
  [name] varchar(255),
  [description] longtext,
  [short_desc] mediumtext,
  [tiny_desc] tinytext,
  [is_active] tinyint(1),
  [category_id] mediumint,
  [price] double,
  [metadata] json,
  [created_at] datetime
)
GO`;

    const result = applyTypeMappings(sql, "mssql");

    expect(result).toContain("NVARCHAR(MAX)"); // longtext, mediumtext
    expect(result).toContain("NVARCHAR(255)"); // tinytext
    expect(result).toContain("BIT"); // tinyint(1)
    expect(result).toContain("[category_id] INT"); // mediumint
    expect(result).toContain("FLOAT"); // double
    expect(result).not.toContain("longtext");
    expect(result).not.toContain("mediumtext");
    expect(result).not.toContain("tinytext");
    expect(result).not.toContain("tinyint(1)");
    expect(result).not.toContain("mediumint");
  });

  it("PG schema → MSSQL target", () => {
    const sql = `CREATE TABLE [users] (
  [id] serial PRIMARY KEY,
  [big_id] bigserial,
  [is_active] bool,
  [data] jsonb,
  [uid] uuid,
  [created_at] timestamp with time zone,
  [score] double precision,
  [amount] numeric(10,2),
  [small_num] int2,
  [med_num] int4,
  [big_num] int8
)
GO`;

    const result = applyTypeMappings(sql, "mssql");

    expect(result).toContain("INT IDENTITY(1,1) PRIMARY KEY"); // serial
    expect(result).toContain("BIGINT IDENTITY(1,1)"); // bigserial
    expect(result).toContain("BIT"); // bool
    expect(result).toContain("NVARCHAR(MAX)"); // jsonb
    expect(result).toContain("UNIQUEIDENTIFIER"); // uuid
    expect(result).toContain("DATETIMEOFFSET"); // timestamp with time zone
    expect(result).toContain("FLOAT"); // double precision
    expect(result).toContain("DECIMAL(10,2)"); // numeric
    expect(result).toContain("SMALLINT"); // int2
    expect(result).not.toContain("serial PRIMARY");
    expect(result).not.toContain("jsonb");
    expect(result).not.toContain(" bool");
  });

  it("MySQL schema → PostgreSQL target with quoting fix", () => {
    const sql = `CREATE TABLE "products" (
  "id" INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  "name" "character varying(255)",
  "description" longtext,
  "is_active" tinyint(1),
  "price" double,
  "created_at" datetime
);`;

    const result = applyTypeMappings(sql, "postgres");

    expect(result).toContain("character varying(255)"); // unquoted
    expect(result).not.toContain('"character varying(255)"'); // no longer quoted
    expect(result).toContain("TEXT"); // longtext
    expect(result).toContain("BOOLEAN"); // tinyint(1)
    expect(result).toContain("DOUBLE PRECISION"); // double
    expect(result).toContain("TIMESTAMP"); // datetime
    // Column/table names should stay quoted
    expect(result).toContain('"products"');
    expect(result).toContain('"id"');
    expect(result).toContain('"name"');
  });

  it("PG schema → MySQL target", () => {
    const sql = `CREATE TABLE \`users\` (
  \`id\` serial PRIMARY KEY,
  \`data\` jsonb,
  \`uid\` uuid,
  \`active\` boolean,
  \`created_at\` timestamp with time zone
);`;

    const result = applyTypeMappings(sql, "mysql");

    expect(result).toContain("INT AUTO_INCREMENT"); // serial
    expect(result).toContain("JSON"); // jsonb
    expect(result).toContain("CHAR(36)"); // uuid
    expect(result).toContain("TINYINT(1)"); // boolean
    expect(result).toContain("DATETIME"); // timestamp with time zone
  });

  it("preserves valid native types (no unnecessary mapping)", () => {
    const mysqlSql = `CREATE TABLE \`t\` (
  \`id\` int PRIMARY KEY AUTO_INCREMENT,
  \`name\` varchar(255),
  \`price\` decimal(10,2),
  \`created_at\` timestamp
);`;
    const result = applyTypeMappings(mysqlSql, "mysql");

    expect(result).toContain("int PRIMARY KEY AUTO_INCREMENT");
    expect(result).toContain("varchar(255)");
    expect(result).toContain("decimal(10,2)");
    expect(result).toContain("timestamp");
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles empty string", () => {
    expect(applyTypeMappings("", "mssql")).toBe("");
    expect(applyTypeMappings("", "postgres")).toBe("");
    expect(applyTypeMappings("", "mysql")).toBe("");
  });

  it("handles multiple tables in one SQL", () => {
    const sql = `CREATE TABLE [a] ([id] serial, [data] jsonb)
GO
CREATE TABLE [b] ([uid] uuid, [active] boolean)
GO`;

    const result = applyTypeMappings(sql, "mssql");

    expect(result).toContain("INT IDENTITY(1,1)");
    expect(result).toContain("NVARCHAR(MAX)");
    expect(result).toContain("UNIQUEIDENTIFIER");
    expect(result).toContain("BIT");
    expect(result).not.toContain("serial");
    expect(result).not.toContain("jsonb");
    expect(result).not.toContain(" uuid");
    expect(result).not.toContain(" boolean");
  });

  it("bigserial is replaced before serial (no partial match)", () => {
    const sql = "[col] bigserial";
    const result = applyTypeMappings(sql, "mssql");
    expect(result).toBe("[col] BIGINT IDENTITY(1,1)");
    // Should NOT be "BIGINT IDENTITY(1,1)IDENTITY(1,1)" or similar
  });

  it("jsonb is replaced before json (no partial match)", () => {
    const sql = "[a] jsonb, [b] json";
    const result = applyTypeMappings(sql, "mssql");
    expect(result).toBe("[a] NVARCHAR(MAX), [b] NVARCHAR(MAX)");
  });

  it("timestamp with time zone replaced before bare timestamp", () => {
    const sql = "[a] timestamp with time zone, [b] timestamp";
    const result = applyTypeMappings(sql, "mssql");
    expect(result).toContain("[a] DATETIMEOFFSET");
    expect(result).toContain("[b] DATETIME2");
  });
});
