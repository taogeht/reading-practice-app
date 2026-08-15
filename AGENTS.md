# AGENTS.md

This repository is a Next.js English-learning platform for administrators,
teachers, and students. Keep changes consistent with the existing application
rather than introducing a parallel architecture.

## Before changing code

1. Read [`docs/codebase-map.md`](docs/codebase-map.md).
2. Read the relevant architecture documents under [`docs/`](docs/).
3. Trace the existing page, API route, service, and database path before editing.
4. Search for existing components, utilities, hooks, services, and schemas before
   creating new ones.
5. Follow the authorization patterns in `src/lib/auth.ts` and `src/lib/auth/`.
6. Preserve unrelated working-tree changes.
7. Run the most relevant available checks and manually exercise changed flows.

## Important architecture

- Frontend and server-rendered pages: `src/app/`
- Native learner app: `apps/mobile/`
- Shared web/mobile contracts: `packages/contracts/`
- Shared UI and providers: `src/components/`
- API: `src/app/api/`
- Domain services and integrations: `src/lib/`
- Database client and schema: `src/lib/db/`
- SQL migrations: `migrations/`
- Authentication: `src/lib/auth.ts`, `src/lib/auth/`
- Shared hooks: `src/hooks/`
- Curriculum data: `src/lib/curriculum/`

See also:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/data-flow.md`](docs/data-flow.md)
- [`docs/auth.md`](docs/auth.md)

## Project-specific rules

- Authentication is custom database-backed session auth, not Better Auth.
- `src/middleware.ts` is not an authorization boundary. Every protected API route
  must authenticate and authorize its own resource.
- Use the class-access helpers for primary/co-teacher checks instead of comparing
  `teacherId` directly.
- The legacy assignment/story reading system and the generated-passage reading
  system are separate. Confirm which model a change targets.
- R2 is private. Store proxy URLs/keys and use the existing authenticated media
  routes and `r2Client` key helpers.
- Import image generation through the `src/lib/image` facade, not a provider
  client directly.
- Do not run `npm run db:migrate` or `npm run db:push` casually. The Drizzle
  journal does not fully match production history; read the database section of
  `docs/architecture.md` first.
- Fire-and-forget work assumes the deployed long-running Node process remains
  alive. Do not silently extend this pattern to serverless-sensitive work.
- There is currently no conventional automated test runner. Do not claim
  `npm test` coverage.

## Commands

```bash
npm run dev
npm run lint
npm run build
npm run typecheck --workspace @starling-rise/mobile
npm run test:mobile-contracts
npm run db:generate
npm run db:studio
```

The `test:*` package scripts are live AI/integration harnesses and may require
credentials, spend money, or write database/storage state. Inspect a script
before running it. `test:mobile-contracts` and `test:class-promotion` are local,
side-effect-free exceptions.
