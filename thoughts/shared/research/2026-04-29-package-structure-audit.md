---
date: 2026-04-29T00:00:00-07:00
researcher: Chetan Kale
git_commit: 9077bfcc319c6564b8e8bbd4e1d3ede960c10d2e
branch: infra
repository: workflows
topic: "Package naming and responsibility audit"
tags: [research, codebase, package-structure, naming, monorepo]
status: complete
last_updated: 2026-04-29
last_updated_by: Chetan Kale
---

# Research: Package Naming and Responsibility Audit

**Date**: 2026-04-29
**Researcher**: Chetan Kale
**Git Commit**: 9077bfcc319c6564b8e8bbd4e1d3ede960c10d2e
**Branch**: infra
**Repository**: workflows

## Research Question

Take a deep look at packages in this repo. Keep an eye out for names that are confusing or not specific enough, and any packages with too many unrelated responsibilities.

## Summary

The repo holds **6 packages** under `packages/` (`collab`, `db`, `resume-screener`, `server`, `shared`, `workflows`) plus **1 app** under `apps/web`. (Note: `CLAUDE.md` lists only 5 packages and omits `resume-screener` — documentation is out of date.)

Three structural issues stand out:

1. **Mixed organizational paradigm.** Most packages are organized by *technical layer* (`db`, `server`, `workflows`, `shared`), but two are organized by *feature* (`collab`, `resume-screener`). This split causes a single business domain (e.g., "documents") to be scattered across 3+ packages while another domain (resume screening) is fully contained in 1.

2. **Generic package names that no longer match contents.** `@app/workflows`, `@app/server`, and `@app/shared` all have names too broad to communicate what's actually inside. The repo itself is also named `workflows`, creating a name collision with `@app/workflows`.

3. **Multi-domain packages.** `@app/db` and `@app/server` each carry three unrelated business domains (collaboration, billing, identity) in a flat structure with no domain grouping.

## Detailed Findings

### Inventory: 6 Packages and Their Actual Contents

| Package | What's in it | Stated purpose | Cohesion |
|---------|-------------|----------------|----------|
| `@app/collab` | Slate + Jupiter OT for collaborative text editing — 9 files at root, no subdirs | None in package.json | **High** — single concern |
| `@app/db` | MikroORM entities for 3 domains: Document/DocumentMember/DocumentOperation (collab), Invoice/PaymentAttempt (billing), Profile (identity) | None | **Low** — flat `entities/` folder mixes 3 domains |
| `@app/resume-screener` | Self-contained CLI tool: PDF/DOCX parsing → Claude extraction → scoring | None | **High** — single concern |
| `@app/server` | Service layer: services for documents, operations, invoices, payments, profiles | None | **Low** — flat `services/` folder mixes 3 domains |
| `@app/shared` | `env.ts` (Zod-validated config) + `money.ts` (Money domain type) | None | **Mixed** — config + a domain primitive |
| `@app/workflows` | One Inngest workflow: invoice payment retry with two Claude agents | None | **High by content, low by name** — only 1 workflow but generically named |

### Naming Issues

#### 1. `@app/workflows` — collides with repo name and is too generic for contents

The repo is `workflows` (per `package.json` and folder name) and the package is also `workflows`. From inside the repo, "workflows" can mean: the repo itself, the package `@app/workflows`, the conceptual pattern of durable agentic workflows (per `CLAUDE.md`), or any specific workflow function. This ambiguity shows up in conversation and in import paths (`@app/workflows/functions`).

The package contains exactly one workflow today: `invoices/pay-invoice.ts`. The directory and exports map (`./client`, `./functions`) are organized as if many workflow domains will eventually live alongside `invoices/`, but none do yet.

- `packages/workflows/src/invoices/pay-invoice.ts:16-171` — sole workflow function
- `packages/workflows/src/invoices/agents/dispute-classifier.ts` — invoice-specific agent
- `packages/workflows/src/invoices/agents/dunning-drafter.ts` — invoice-specific agent

#### 2. `@app/shared` — a name that means "I didn't know where to put this"

`@app/shared` is the canonical anti-pattern name in any monorepo. It currently holds two unrelated concerns:
- `env.ts` — environment variable validation (config)
- `money.ts` — `Money` type with formatting and Zod schema (domain primitive)

The `package.json` exports map only declares `.` and `./env` — `./money` isn't a separate export, so `money.ts` is reached only through the barrel index.

- `packages/shared/src/env.ts` — env config
- `packages/shared/src/money.ts` — Money domain type
- `packages/shared/package.json:7-10` — exports `.` and `./env` only

#### 3. `@app/server` — the package contains no actual server

This package has no HTTP server, no Express/Fastify, no routing, no request/response handling. The actual HTTP server lives at `apps/web/app/api/*` (Next.js route handlers).

What's inside `@app/server`:
- `context.ts` — MikroORM EntityManager fork + transactional helpers
- `services/*` — typed CRUD/domain functions wrapping the ORM

In other words, `@app/server` is a *services / data-access* layer. The name "server" is misleading because (a) it doesn't run anything, and (b) it's also imported by `@app/workflows` (a non-HTTP context), so it isn't even server-only.

- `packages/server/src/context.ts` — `withServerContext`, `withTransactionalContext`
- `packages/server/src/services/` — 5 service modules
- `apps/web/app/api/docs/route.ts` — actual HTTP server lives here

#### 4. `@app/db` — narrow name, but acceptable

The name accurately describes the package as the database/ORM layer. The issue here is responsibility (next section), not naming.

#### 5. `@app/collab` — short but unambiguous in context

Everything in this package is about real-time collaborative text editing using OT against Slate. The name is brief but its scope is consistent with its name. It could be more specific (e.g., `@app/collab-editor`) but the current name is not actively misleading.

#### 6. `@app/resume-screener` — name is fine; placement is the question

The name is specific and accurate. The structural concern is whether a CLI tool (with its own `cli.ts` entry point and Claude integration) belongs in `packages/` or `apps/` — see "Architectural inconsistency" below.

### Responsibility Overload

#### `@app/db` mixes three unrelated business domains

The `entities/` folder is flat — no grouping by domain:

```
packages/db/src/entities/
├── Document.ts
├── DocumentMember.ts
├── DocumentOperation.ts
├── Invoice.ts
├── PaymentAttempt.ts
└── Profile.ts
```

These six entities span three unrelated business domains:
- **Collaboration**: `Document`, `DocumentMember`, `DocumentOperation`
- **Billing**: `Invoice`, `PaymentAttempt`
- **Identity**: `Profile`

There is no `entities/billing/`, `entities/collab/`, etc. — every new domain entity will continue piling into the flat folder.

- `packages/db/src/entities/Document.ts` — collaboration
- `packages/db/src/entities/Invoice.ts` — billing
- `packages/db/src/entities/Profile.ts` — identity

#### `@app/server` mirrors the same domain spread

The `services/` folder is also flat and follows the same three-domain mix:

```
packages/server/src/services/
├── documents.ts      ← collab
├── operations.ts     ← collab
├── invoices.ts       ← billing
├── payments.ts       ← billing
└── profiles.ts       ← identity
```

Both `@app/db` and `@app/server` are essentially the union of all domains' data layer — but with no internal seams to separate them.

#### `@app/shared` mixes config and domain primitives

Two file types live together in `@app/shared`:
- Runtime config validation (`env.ts`): cross-cutting infrastructure concern
- Domain primitive (`money.ts`): a business-domain value type

These don't grow at the same rate or for the same reasons. As the app grows, "shared" tends to accumulate orphan utilities (date helpers, string utils, etc.) since there's no other obvious home.

#### `@app/workflows` has the opposite problem: too narrow for its name

The package contains only `invoices/`. Despite the broad name, no other workflow domains exist in it. Either the package is misnamed (it's really `@app/invoice-workflows`), or it's empty scaffolding waiting for more workflows.

### Architectural Inconsistency: Mixed Paradigm

The packages are split along **two different organizational axes**:

| Axis | Examples |
|------|----------|
| **By technical layer** | `@app/db` (data), `@app/server` (services), `@app/workflows` (orchestration), `@app/shared` (utilities) |
| **By feature/domain** | `@app/collab` (collaborative editing), `@app/resume-screener` (resume screening) |

The consequence is that a single business domain ends up scattered across multiple "layer" packages while other domains live entirely within a single "feature" package:

**The "documents" domain is in 3+ packages:**
- `@app/collab` — OT logic, Slate adapter, in-memory doc state
- `@app/db` — `Document`, `DocumentMember`, `DocumentOperation` entities
- `@app/server/services/documents.ts` + `operations.ts` — service-layer wrappers
- `apps/web/app/api/docs/*` — HTTP routes

**The "billing" domain is in 3 packages:**
- `@app/db` — `Invoice`, `PaymentAttempt` entities
- `@app/server/services/invoices.ts` + `payments.ts` — service wrappers
- `@app/workflows/invoices/` — Inngest workflow + agents

**The "resume screening" domain is in 1 package:**
- `@app/resume-screener` — everything (parsing, Claude extraction, scoring, CLI)

This is the most fundamental structural inconsistency. The "feature" packages don't use `@app/db` or `@app/server` (verified by import audit — both `@app/collab` and `@app/resume-screener` have zero workspace imports). The "layer" packages don't have feature folders. This means there are effectively two architectures inside the same repo.

### Stale Dependency Declaration

`@app/workflows/package.json` lists `@app/shared` as a dependency, but the audit found **zero** imports from `@app/shared` anywhere in `packages/workflows/src/`.

- `packages/workflows/package.json:18` — declares `@app/shared: workspace:*`
- No matching `from '@app/shared'` import found in `packages/workflows/src/**`

### Stale Documentation

`CLAUDE.md` reads:
> `/packages/` - Workspace packages (`@app/db`, `@app/server`, `@app/workflows`, `@app/shared`, `@app/collab`)

Actual contents of `packages/`: `collab`, `db`, `resume-screener`, `server`, `shared`, `workflows` (6 packages). `resume-screener` is missing from the doc.

## Code References

### Naming
- `packages/workflows/src/invoices/pay-invoice.ts:16-171` — only workflow in the "workflows" package
- `packages/shared/src/env.ts` — config inside "shared"
- `packages/shared/src/money.ts` — domain primitive inside "shared"
- `packages/shared/package.json:7-10` — exports `.` and `./env` only (not `./money`)
- `packages/server/src/context.ts` — context helpers (no HTTP server here)
- `apps/web/app/api/docs/route.ts` — actual HTTP server lives here

### Responsibility overload
- `packages/db/src/entities/` — 6 entities, 3 domains, no subdirectories
- `packages/server/src/services/` — 5 services, 3 domains, no subdirectories
- `packages/workflows/src/invoices/` — only domain folder in the package

### Cross-package imports
- `packages/server/src/services/documents.ts` — imports 7 entity types from `@app/db`
- `packages/workflows/src/invoices/pay-invoice.ts:1-12` — imports from `@app/server` and uses `withServerContext`
- `packages/workflows/package.json` — declares `@app/shared` dep that is never imported

### Feature-package isolation
- `packages/collab/src/*` — zero `@app/*` imports (fully self-contained)
- `packages/resume-screener/src/*` — zero `@app/*` imports (fully self-contained CLI)

## Architecture Documentation

### Dependency graph (actual imports)

```
@app/web
   │
   ├─→ @app/collab     (4 imports — types, useDoc hook, applyOp, transform)
   ├─→ @app/server     (4 imports — withServerContext, document services)
   ├─→ @app/shared     (4 imports — env config)
   └─→ @app/workflows  (1 import — Inngest functions for /api/inngest)

@app/workflows
   └─→ @app/server     (1 import — invoice + payment services)

@app/server
   └─→ @app/db         (7 imports — entities and schemas)

@app/collab            (no workspace imports)
@app/db                (no workspace imports)
@app/shared            (no workspace imports)
@app/resume-screener   (no workspace imports)
```

The dependency graph itself is clean — no cycles, clear directionality. The issue is what each node *contains*, not how they reference each other.

### What "shared", "server", and "workflows" each currently are

| Name | What it actually is |
|------|--------------------|
| `@app/shared` | Env validation + Money type |
| `@app/server` | ORM context + service-layer functions for 3 domains |
| `@app/workflows` | One Inngest workflow (invoice payment) + two Claude agents |

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-04-21-repo-scaffold-overview.md` — earlier repo scaffold doc; predates `resume-screener` and may explain why `CLAUDE.md` is missing it (not yet read in this audit)

## Related Research

- `thoughts/shared/research/2026-04-21-repo-scaffold-overview.md`

## Open Questions

- Was `resume-screener` intended to be in `apps/` rather than `packages/`? It has its own CLI entry point and zero workspace imports, which matches the shape of an app more than a library.
- Is `@app/workflows` scaffolded for future workflow domains, or is "workflows" being used to mean "Inngest functions specifically"?
- Was the `@app/shared` dependency added to `@app/workflows` proactively (anticipating use of `Money`) or as a leftover from copy-paste?
