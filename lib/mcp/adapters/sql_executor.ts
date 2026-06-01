export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}

export interface SqlExecutor {
  execute(sql: string): Promise<QueryResult>;
}

export class PgSqlExecutor implements SqlExecutor {
  async execute(sql: string): Promise<QueryResult> {
    const { executeSql } = await import("../../pg.ts");
    return await executeSql(sql);
  }
}

export class MockSqlExecutor implements SqlExecutor {
  private result: QueryResult;

  constructor(overrides?: Partial<QueryResult>) {
    this.result = { rows: [], rowCount: null, ...overrides };
  }

  async execute(_sql: string): Promise<QueryResult> {
    return this.result;
  }
}
