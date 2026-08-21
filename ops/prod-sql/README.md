# Pending production SQL

Data changes that have to reach production by hand, kept in version control so
nothing gets lost between "it works locally" and "it works for the school".

**Not for schema changes.** Those still go in `migrations/` and are verified
with `npm run check:migrations`. This directory is for *row* changes — creating
a class, seeding a setting, backfilling a column — the kind of thing you'd
otherwise paste into a terminal once and forget you did.

## Why it exists

The local database is a disposable snapshot of production (`npm run
db:sync-from-prod`), so anything created locally is wiped on the next refresh
and never reaches prod on its own. Writing the statement down here is what
carries it across.

## How to use it

1. **Write the change as a file** named `YYYY-MM-DD-slug.sql`.
2. **Guard it with the ledger** so it is safe to re-run and self-tracking —
   copy the shape from an existing file. The `data_migrations` table
   (`id text PRIMARY KEY, applied_at timestamptz`) already exists in prod;
   migration 0060 introduced it.
3. **Test it locally first**, against the restored snapshot.
4. **Commit it** with the code it belongs to.
5. **After deploying**, paste the file into the Postgres terminal on the
   Coolify VPS. Prod Postgres has no public port, so that terminal is the way
   in.
6. **Check what has landed** with `npm run check:prod-sql`, which compares the
   files here against the `data_migrations` rows in whatever database
   `DATABASE_URL` points at.

## Conventions

- One logical change per file. A file is applied or it isn't.
- Always guard with the ledger, even when the statement looks idempotent on its
  own. `ON CONFLICT DO NOTHING` keeps the data correct but tells you nothing
  about whether the change has been applied; the ledger row is the record.
- Derive foreign keys by lookup (`SELECT ... FROM classes WHERE slug = ...`)
  rather than pasting UUIDs, so the same file is correct on local and prod.
- End with a `SELECT` that shows what landed, so pasting it into a terminal
  gives you confirmation rather than silence.
- Applied files stay here. They are the history of what was done to prod.
