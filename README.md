# Setup

- Create `.env` from `.env.example`
- `pnpm install`
- `pnpm exec cypress install`
- `pnpm exec cypress verify`
- `pnpm run test`
- `pnpm run test:run` (headless), or one spec with `pnpm run test:api` / `pnpm run test:ui`

# Before running

- Database, Backend (port 3001) and Frontend (port 5173) must be running locally
- Every spec runs `db:prototype` in `../Backend` first: **all data in the local database is replaced by the seed data**
- Login is done by signing a session cookie with `JWT_SECRET` from `../Backend/.env` (tests cannot go through CMU OAuth)

# Setup from scratch

- See https://cmu.to/fullstack69

# Issue

- As of July 2026, Typescript 7 does not work with the current version of Cypress (15.18.1). Therefore, we are using Typescript 6.
