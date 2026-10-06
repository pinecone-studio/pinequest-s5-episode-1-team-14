# Contributing

## Branch rules

- `main` is protected: no direct pushes, every change lands through a PR.
- Pull the latest `main`, then create a new branch for every task, named `<type>/<short-task>`:
  - `feat/twilio-media-stream`
  - `feat/elevenlabs-tts`
  - `feat/rag-knowledge`
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

- Use Conventional Commits, for example `feat(telephony): add media stream handler`
  or `docs(readme): document local setup`.
- Rebase/squash locally before opening the PR if you made a lot of small
  checkpoint commits — keep the PR's commit history readable.

## Opening a PR

- Open the PR against `main` and fill in the template (what changed, why,
  changes, validation, relevant screenshots/logs, and limitations).
- Link the relevant TDD section or issue.
- Stop after opening the PR and wait for at least one human approval.
- Do not automatically approve or merge your own PR.
- After a human-approved merge, switch to `main`, pull latest, and create the
  next task's branch. Do not stack unrelated work onto the open PR.
- Delete the branch after merge.

## Before you push

- `npm run lint` passes in the workspace you touched.
- The app still builds (`npm run build:backend` / `npm run build:pwa`).
