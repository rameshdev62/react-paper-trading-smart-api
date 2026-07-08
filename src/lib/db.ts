import pg from "pg";

const connectionString = process.env.DATABASE_URL;

if (typeof window === "undefined" && !connectionString) {
  throw new Error(
    "DATABASE_URL environment variable is not set. " +
    "Set it in your .env file (local) or Vercel environment variables (production)."
  );
}

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
