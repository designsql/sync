import dbmlConnector from "@dbml/connector";
import { ok, info, fail } from "../utils/log.js";

// @dbml/core's './import' submodule name conflicts with TypeScript's NodeNext resolution,
// so `importer` cannot be resolved as a named export. Access it via the module object at runtime.
type DbmlImporter = { generateDbml: (schema: unknown) => string };
const { importer } = (await import("@dbml/core")) as unknown as { importer: DbmlImporter };

const { connector } = dbmlConnector;

export async function push(
  dbType: string,
  connectionString: string,
  token: string,
  projectTag: string,
  apiUrl: string
): Promise<void> {
  info(`Connecting to ${dbType} database...`);

  const schemaJson = await connector.fetchSchemaJson(connectionString, dbType);

  // De-duplicate refs that @dbml/connector sometimes returns twice for the same FK
  const schema = schemaJson as { tables?: unknown[]; refs?: { endpoints?: { tableName: string; fieldNames: string[] }[] }[] };
  if (Array.isArray(schema.refs)) {
    const seen = new Set<string>();
    schema.refs = schema.refs.filter((ref) => {
      if (!Array.isArray(ref.endpoints)) return true;
      const key = ref.endpoints
        .map((e) => `${e.tableName}.${(e.fieldNames ?? []).join(",")}`)
        .sort()
        .join("--");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const tableCount = schema.tables?.length ?? 0;
  ok(`Schema extracted — ${tableCount} table(s) found`);

  info("Converting schema to DBML...");

  let dbmlString: string;
  try {
    dbmlString = importer.generateDbml(schema);
  } catch (err: unknown) {
    const detail =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err, null, 2)
          : String(err);
    fail(`Failed to convert schema to DBML:\n${detail}`);
    process.exit(1);
  }

  ok(`DBML generated (${dbmlString.length} chars)`);

  info(`Pushing DBML to designsql cloud...`);
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "x-designsql-token": token,
      "x-designsql-tag": projectTag,
    },
    body: dbmlString,
  });

  if (!response.ok) {
    const errorText = await response.text();
    fail(`Server responded with ${response.status}: ${errorText}`);
    process.exit(1);
  }

  const resJson = (await response.json()) as {
    tagId?: string;
    tagName?: string;
  };
  ok(`Push complete! Tag: ${resJson.tagName ?? projectTag} (${resJson.tagId})`);
}
