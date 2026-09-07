# Start here: unified workspace into FLOWSTATE

Prepared 2026-09-06. User direction: Claude and Codex should share a workspace and changes, and all workspace apps should integrate into Phone Dashboard. This supersedes the earlier suggestion to build a separate dashboard hub.

## Reading order

1. [Project instructions](../../CLAUDE.md), including current Google and personal-data boundaries.
2. [Design and scope](SPEC.md).
3. [Current execution status](STATUS.md).
4. [Implementation plan](../superpowers/plans/2026-09-06-unified-phone-dashboard.md).
5. [Existing product direction](../../PRODUCT.md), [current handoff](../../HANDOFF.md), and the specific source files listed in your task.

The newer `CLAUDE.md`, `HANDOFF.md`, and `DAILY-CHECKINS-AND-REWARDS.md` override historical punitive habit/reward wording in `PRODUCT.md`. Do not restore old behavior while adding integrations.

## Shared agent protocol

- One specification, one task ledger, one set of changes. Agent-specific chat memory is not the authoritative project record.
- At session start, read STATUS and run `git status --short`, `git branch --show-current`, and `git rev-parse HEAD` inside each affected repository. Record actual checkout paths and commits. Check any existing uncommitted changes before editing overlapping files.
- Claim one task in STATUS with agent/session label, checkout path, start time, and file scope. Default to sequential handoffs. A Markdown claim is advisory, not an atomic lock: do not let two active chats edit overlapping files. Confirm that the prior agent finished before taking ownership.
- Use the same saved checkout when handing off locally. If an agent uses a worktree or another machine, record it and explicitly transfer the reviewed commit before another agent resumes; do not assume changes in one checkout exist in another.
- Keep commits per repository and per testable task when committing is within the execution request. Record exact hashes and integration order. Root bootstrap documents are local files outside Git; include them in a private workspace backup, not in a new root repository.
- Before handing off, update STATUS with files changed, actual commands/results, unresolved failures, local/remote/deployed states, and the exact next task. Amend the spec only when an architectural decision changes; record the reason and date.
- Instructions are portable Markdown. If a named skill/tool is unavailable in Claude or Codex, follow the documented task and verification steps directly. Skill installation is not a prerequisite for reading or executing the plan. Follow the host's delegation policy; no parallel agents are required.
- Do not duplicate secrets, account identifiers, task contents, financial values, raw logs, document excerpts, or chat transcripts into the shared ledger. Store decisions and source pointers instead.
- Graphify is a local navigation aid. Verify important edges against source, and record regeneration scope/time. No runtime integration should depend on its HTML, community labels, or inferred links.

## What is already done

The spec, implementation plan, status ledger, root entry points, and Phone Dashboard agent pointers are written. No collectors, cloud sync, UI panels, source adapters, git hooks, or deployments were implemented in this planning session.

## Resume prompt

> Read this file, SPEC.md, STATUS.md, and the linked implementation plan. Implement the first incomplete task with satisfied dependencies. Use Phone Dashboard as the integration destination. Keep both agents aligned through this same ledger. Verify the task and update STATUS with concrete evidence and the next step before stopping.

For chat-only agents: attach this file, SPEC.md, STATUS.md, and the implementation plan, plus source files for the selected task. They cannot inspect local files or inherit another product's tools from a pasted path.

## Instruction entry points

The workspace root has `AGENTS.md` and `CLAUDE.md` pointing here; Phone Dashboard also has both entry points. OpenAI documents Codex's AGENTS.md mechanism in [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Explicitly using this start file avoids depending on identical instruction discovery across products. Opening a sibling repository alone requires the resume prompt with this plan's path.
