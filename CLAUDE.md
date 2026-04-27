## High-Level Architecture

### Tech Stack
- **Frontend**: pnpm + Turborepo monorepo scaffolded for a full-stack TypeScript app with durable, agent-embedded workflows.
- **Backend**: Vercel Server Functions
- **Database**: Supabase (PostgreSQL)


### Project Structure
- `/apps/` - Feature-based modules
- `/packages/` - Workspace packages (`@app/db`, `@app/server`, `@app/workflows`, `@app/shared`, `@app/collab`)

