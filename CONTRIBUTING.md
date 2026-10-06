# Contributing

## Branch rules

- `main` is protected: no direct pushes, every change lands through a PR.
- Branch off `main` for every task, name it `<type>/<short-task>`:
  - `feature/twilio-media-stream`
  - `feature/elevenlabs-clone`
  - `feature/rag-knowledge`
  - `fix/<bug-name>`
  - `chore/<task-name>`
- One branch = one task = one PR. Don't bundle unrelated changes.

## Keep PRs small

- Scope a PR to one reviewable unit of work (one endpoint, one UI section, one
  integration step) — not a full day's output in one commit.
- If a task from the TDD's 14-Day Delivery Plan spans multiple days, split it
  into multiple PRs as soon as each piece is independently working.
- A PR that only you can explain by scrolling through 500+ lines is too big —
  split it.

## Commits

- Commit message: short imperative summary (`add twilio media stream handler`,
  not `fixed stuff` or `wip`).
- Rebase/squash locally before opening the PR if you made a lot of small
  checkpoint commits — keep the PR's commit history readable.

## Opening a PR

- Fill in the PR template (what changed, why, how you tested it).
- Link the relevant TDD section or issue.
- Request a review from the other backend/frontend owner before merging.
- Delete the branch after merge.

## Before you push

- `npm run lint` passes in the workspace you touched.
- The app still builds (`npm run build:backend` / `npm run build:pwa`).
