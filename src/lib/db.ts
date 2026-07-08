import pg from "pg";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Ramesh%40dev62@db.jzfecbakzecdlqyflnxt.supabase.co:5432/postgres";

const globalForDb = globalThis as unknown as {
  pool: pg.Pool | undefined;
};

let pool: pg.Pool;

if (typeof window === "undefined") {
  if (!globalForDb.pool) {
    globalForDb.pool = new pg.Pool({
      connectionString,
      ssl: connectionString?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
    });
  }
  pool = globalForDb.pool;
} else {
  pool = null as unknown as pg.Pool;
}

export { pool };

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}
