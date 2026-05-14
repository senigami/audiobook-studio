# Agent Notes

This file is for durable repo-specific learnings that help future work but do not yet belong as hard rules.

## Usage

- Put normative, repo-level guidance in `.agent/rules.md` or `.agent/rules/`.
- Put useful learnings, reminders, heuristics, and recurring gotchas here when they are worth remembering but are not yet stable enough to be promoted into rules.
- When a note becomes clearly normative or repeatedly important, move it into the relevant rules file.

## Durable Project Notes

- Studio 2.0 runtime work should treat the managed TTS Server and Studio orchestrator as the intended production defaults. Do not flip production defaults back to older behavior to hide test failures.
- Session handoffs, branch status, and temporary CI context belong in the ignored `Memory/` directory or in explicit phase handoff artifacts under `plans/implementation/`, not in this repo-persistent notes file.
