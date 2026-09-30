import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { isAbsolute } from "node:path";

type Row = Record<string, unknown>;

class SqliteStatement {
  constructor(
    readonly connection: DatabaseSync,
    private readonly sql: string,
    private readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: SQLInputValue[]) {
    return new SqliteStatement(this.connection, this.sql, values);
  }

  execute<T = Row>(): { results: T[] } {
    const statement = this.connection.prepare(this.sql);
    // D1 accepts numbered SQLite parameters positionally; node:sqlite names them.
    const numbered = [...new Set(this.sql.match(/\?\d+/g) ?? [])];
    const rows = numbered.length
      ? statement.all(Object.fromEntries(numbered.map((key) => {
          const index = Number(key.slice(1)) - 1;
          if (index >= this.values.length) throw new Error(`Missing SQL parameter ${key}`);
          return [key, this.values[index]];
        })))
      : statement.all(...this.values);
    return { results: rows as T[] };
  }

  async first<T = Row>(): Promise<T | null> {
    return this.execute<T>().results[0] ?? null;
  }

  async all<T = Row>() {
    return this.execute<T>();
  }

  async run() {
    return this.execute();
  }
}

class SqliteDatabase {
  constructor(private readonly connection: DatabaseSync) {}

  prepare(sql: string) {
    return new SqliteStatement(this.connection, sql);
  }

  async batch(statements: SqliteStatement[]) {
    if (statements.some((statement) => statement.connection !== this.connection)) {
      throw new Error("Batch statements must use the same database");
    }
    // No await inside the transaction: requests cannot interleave batch writes.
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.execute());
      this.connection.exec("COMMIT");
      return results;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }
}

let instance: SqliteDatabase | undefined;
export function database() {
  if (!instance) {
    const filename = process.env.DATABASE_PATH;
    if (!filename || !isAbsolute(filename)) {
      throw new Error("DATABASE_PATH must be an absolute SQLite file path");
    }
    const connection = new DatabaseSync(filename);
    connection.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    instance = new SqliteDatabase(connection);
  }
  return instance;
}

export function config(): Cloudflare.Env {
  return process.env as Cloudflare.Env;
}
