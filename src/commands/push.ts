import { exporter } from "@dbml/core";
import dbmlConnector from "@dbml/connector";
import { ok, info, fail } from "../utils/log.js";

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

  const tableCount =
    (schemaJson as { tables?: unknown[] }).tables?.length ?? 0;
  ok(`Schema extracted — ${tableCount} table(s) found`);

  info("Converting schema to DBML...");
  const dbmlString = exporter.export(JSON.stringify(schemaJson), "dbml");
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
