# Agent skill evals

Promptfoo evals that verify the agent skills in `skills/` are **discovered,
followed, and effective** — starting with `skills/pull-requests/SKILL.md`.

Unlike the transcript harness in `test/ai-development/run.mjs`, these evals run
through [promptfoo](https://promptfoo.dev), so results land in a comparable
table (`npm run view`) and output quality is graded, not just tool usage.

## What the PR-skill eval checks

The agent is asked to author a PR description for a pinned commit
(`1f27df296` — Notes: sync the sidebar selection to the caret marker) in the
real checkout. A custom provider (`providers/agent-provider.mjs`) captures the
transcript and the graders then verify:

**Process** (from the transcript — did the agent do the right things?)

- Hit the skill: invoked the skill natively (Claude discovers it through the
  `.claude/skills/pull-requests` stub) or read `skills/pull-requests/SKILL.md`
- Read the template: read `.github/PULL_REQUEST_TEMPLATE.md`
- Inspected the diff: ran `git show`/`diff`/`log` (the skill's
  "describe the committed diff" rule)

**Output** (deterministic, `assertions/grade-pr-description.cjs`)

- Template sections present and in order (What / Why / How / Testing Instructions)
- Keyboard testing section (this fixture is a UI/caret change, where the
  template requires it)
- Numbered testing steps ending in an observable result ("Confirm …")
- No environment-setup boilerplate in testing steps
- Non-empty AI-tools disclosure
- Succinct (≤ 450 words; the skill asks for under 400, the grader allows a
  small tolerance for run-to-run variance)

**Quality** (`llm-rubric`) — would the description actually help a reviewer,
or is it a technically accurate file inventory?

The Claude config also runs a **baseline provider with repo guidance disabled**
(`setting_sources: []`). It is expected to fail — that red row is the proof the
eval discriminates, mirroring the v1/v2 comparison pattern from the evals
workshop.

## Running

```bash
cd test/ai-development/evals
npm install

# Fast, free: unit-test the deterministic grader against canned outputs.
npm run test:grader

# Live agent runs (minutes + real tokens each):
npm run eval:claude
npm run eval:codex

npm run view   # browse results
```

Agents run read-only: Claude behind a `canUseTool` guard that only allows file
reads and read-only git commands, Codex in its `read-only` sandbox. Your
checkout is never modified.

## Adding an eval for a new skill

1. Pick a pinned fixture (a merged commit works well) where following the skill
   visibly changes the output.
2. Add a grader in `assertions/` with canned good/bad samples in `fixtures/`
   and cases in `scripts/test-grader.mjs`; make the grader tests pass before
   burning agent tokens.
3. Add a promptfoo config wiring the provider, the grader, and an `llm-rubric`
   for the judgment calls regexes can't make.
