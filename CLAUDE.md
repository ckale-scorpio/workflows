## High-Level Architecture

### Tech Stack
- **Frontend**: pnpm + Turborepo monorepo scaffolded for a full-stack TypeScript app with durable, agent-embedded workflows.
- **Backend**: Vercel Server Functions
- **Database**: Supabase (PostgreSQL)


### Project Structure
- `/apps/` - Feature-based modules
- `/packages/` - Workspace packages (`@app/db`, `@app/services`, `@app/jobs`, `@app/core`, `@app/collab`, `@app/resume-screener`)
- `/.claude/plugins/workflows/` - Claude Code plugin (skills versioned here, distributed via plugin system)

### Plugin & Skills Convention
All team skills live in `.claude/plugins/workflows/skills/<skill-name>/SKILL.md` and are distributed via the Claude Code plugin system. Supporting CLI tools live in `packages/`.

**One-time setup (new team members)** — run from the repo root:
```bash
cd /path/to/workflows   # ensure you're at the repo root
claude plugin marketplace add "$PWD/.claude/plugins" --scope project
claude plugin install workflows@workflows --scope project
```

Skills then appear as `/workflows:<skill-name>`. Restart Claude Code after installing.

**Adding a new skill**:
```bash
mkdir -p .claude/plugins/workflows/skills/my-skill
# create .claude/plugins/workflows/skills/my-skill/SKILL.md
```

No symlinks needed. Skill-internal `.cache/` and test data are gitignored. Everything else (SKILL.md, fixtures/jd.yaml) is committed.

