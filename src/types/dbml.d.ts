declare module "@dbml/connector" {
  const dbmlConnector: {
    connector: {
      fetchSchemaJson(
        connectionString: string,
        format: string
      ): Promise<{ tables?: unknown[] }>;
    };
  };
  export default dbmlConnector;
}

declare module "@dbml/core" {
  export const exporter: {
    export(input: string, format: string): string;
  };
}
