// Imported as a side-effect from one-shot scripts in this directory. ESM
// hoists imports, so importing this file FIRST guarantees that .env.local
// is loaded before any module that depends on DATABASE_URL (notably
// ../src/lib/db, which throws at module-load time if the var is missing).
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());
