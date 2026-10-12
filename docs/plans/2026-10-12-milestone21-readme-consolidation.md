# Milestone 21 — README Documentation Consolidation & Polish

## Problem

The README has two overlapping API sections that duplicate and contradict each other:

1. **"## API Reference"** (added in M20) — endpoints table, curl examples, SSE format,
   error table, validation constraints. **Health response example is factually wrong**
   (shows `"uptime": "00:05:23"` but the code returns `"uptimeSeconds": 42`).

2. **"## API"** (from earlier milestones, lower in the file) — same endpoints documented
   again with a different structure. Health response example here is **correct**.

Additionally:
- README milestones list stops at M19; M20 (non-root containers + API docs) is missing.
- Two separate Authentication subsections exist (one per API section).

For a portfolio project reviewed by engineering managers, contradictory docs are worse
than no docs — they signal carelessness.

## Plan

### Task 1: Consolidate API sections
- Remove the older "## API" section entirely (its content is superseded by "## API Reference").
- Move the OpenAPI schema subsection (the only unique content in the old "## API" section)
  into "## API Reference" as a subsection.
- Fix the health response example in "## API Reference" to match the actual code output:
  `{ status, version, uptimeSeconds, checks }`.
- Verify: no duplicate endpoint headings remain; health example matches HealthResponseWriter.cs.

### Task 2: Add M20 to README milestones list
- Append M20 entry after M19 in the milestones section.
- Verify: README milestones list includes M20.

### Task 3: Add M21 to CHANGELOG
- Add M21 entry under [Unreleased] in CHANGELOG.md.
- Verify: CHANGELOG has M21 entry.

### Task 4: Add deployment config test for README consistency
- Add a test verifying the README health example matches the actual response shape
  (`uptimeSeconds`, not `uptime`; `checks` array present).
- Add a test verifying M20 is in the README milestones list.
- Verify: new tests pass.

### Task 5: Build + test + commit + push + verify CI
- `dotnet build OmniChat.slnx -c Release` — 0 errors, 0 warnings
- `dotnet test OmniChat.slnx -c Release` — all pass
- `cd frontend && npm run build` — passes
- `git commit + push`
- `gh run list` — CI green
