import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = new Client({
  connectionString,
});

// Connect to database
client.connect().catch((err) => {
  console.error('Failed to connect to database:', err);
});

export const db = drizzle(client, { schema });

export * from './schema';