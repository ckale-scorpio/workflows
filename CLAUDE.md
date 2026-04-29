## High-Level Architecture

### Tech Stack
- **Frontend**: pnpm + Turborepo monorepo scaffolded for a full-stack TypeScript app with durable, agent-embedded workflows.
- **Backend**: Vercel Server Functions
- **Database**: Supabase (PostgreSQL)


### Project Structure
- `/apps/` - Feature-based modules
- `/packages/` - Workspace packages (`@app/db`, `@app/server`, `@app/workflows`, `@app/shared`, `@app/collab`)
- `/.claude/skills/` - Custom Claude Code skills (versioned here, symlinked to `~/.claude/skills/<name>`)

### Custom Skills Convention
Custom skills live in `.claude/skills/<skill-name>/` in this repo and are symlinked into `~/.claude/skills/` so Claude Code discovers them globally.

To add a new skill:
```bash
mkdir -p .claude/skills/my-skill
# create .claude/skills/my-skill/SKILL.md
ln -s "$(pwd)/.claude/skills/my-skill" ~/.claude/skills/my-skill
```

Skill-internal `node_modules/` and `.cache/` are gitignored. Everything else (source, SKILL.md, references/) is committed.

