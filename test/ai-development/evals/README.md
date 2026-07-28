# Agent skill evals

Promptfoo evals that verify the agent skills in `skills/` are **discovered,
followed, and effective** — starting with `skills/pull-requests/SKILL.md`.

Unlike the transcript harness in `test/ai-development/run.mjs`, these evals run
through [promptfoo](https://promptfoo.dev), so results land in a comparable
table (`npm run view`) and output quality is graded, not just tool usage.

## What the PR-skill eval checks

The agent is asked to author a PR description for a pinned commit
(`1f27df296` — Notes: sync the sidebar selection to the caret marker). The
provider builds a disposable two-commit repository from that historical change,
overlays the guidance variant under test, and captures the transcript.

The fixture contains the Gutenberg source and guidance needed for the task, but
does not contain this eval's configuration, graders, or golden answers.

**Process** (from the transcript — did the agent do the right things?)

-   Hit the skill: invoked the skill natively (Claude discovers it through the
    `.claude/skills/pull-requests` stub) or read `skills/pull-requests/SKILL.md`
-   Read the template: read `.github/PULL_REQUEST_TEMPLATE.md`
-   Inspected the diff: ran `git show`/`diff`/`log` (the skill's
    "describe the committed diff" rule)

**Output** (deterministic, `assertions/grade-pr-description.cjs`)

-   Template sections present and in order (What / Why / How / Testing Instructions)
-   Keyboard testing section (this fixture is a UI/caret change, where the
    template requires it)
-   Numbered testing steps ending in an observable result ("Confirm …")
-   No environment-setup boilerplate in testing steps
-   Non-empty AI-tools disclosure
-   Succinct (≤ 450 words; the skill asks for under 400, the grader allows a
    small tolerance for run-to-run variance)

**Quality** (`llm-rubric`) — would the description actually help a reviewer,
or is it a technically accurate file inventory?

Both agent configs compare two otherwise-identical fixtures:

-   **Candidate** includes the pull-request skill and its agent routing.
-   **Control** omits that skill and routing while retaining the same PR
    template and other repository guidance.

Each provider runs twice. The candidate-control score delta is more useful than
expecting one particular row to always be red: it shows whether the skill is
helping, neutral, or regressing over time.

The eval scripts keep assertion failures in the report but do not return a
failing process status merely because a control row is red. Provider/runtime
errors still fail the command.

## Running

```bash
# Install the isolated eval toolchain once.
npm --prefix test/ai-development/evals install

# Fast, free: test the grader and disposable fixtures.
npm run test:agent-evals

# Live agent runs (minutes + real tokens each):
npm run test:agent-evals:claude
npm run test:agent-evals:codex

# Summarize pass rates plus separate compliance and usefulness deltas.
npm --prefix test/ai-development/evals run report

# Append that summary to a local JSONL history file.
npm --prefix test/ai-development/evals run report:record

# Browse the detailed Promptfoo results.
npm --prefix test/ai-development/evals run view
```

Subject agents run in disposable repositories with network and web search
disabled. They may write inside the fixture, which is deleted after the run;
the developer's checkout is not used as the subject working directory. Both
agents' outputs are graded by the same tool-free Claude judge so their rubric
scores are comparable.

`results/history.jsonl` is intentionally ignored. Keep it locally for
development comparisons, or retain it as a scheduled-job artifact when these
evals are automated.

This package intentionally keeps its own lockfile instead of joining the root
npm workspace. Promptfoo's large, fast-moving dependency graph currently
hoists versions that conflict with Gutenberg's lint toolchain; keeping the eval
runner isolated avoids changing production development dependencies.

Promptfoo is intentionally held on the `0.120.x` release line. Versions from
`0.121.x` require Node.js `^20.20.0` or `>=22.22.0`, while Gutenberg's
checked-in development runtime is Node.js `20.19.0`. Upgrade Promptfoo after
Gutenberg raises that runtime; until then, the older compatible line keeps the
standard setup working without requiring a second Node.js installation.

## Adding an eval for a new skill

1. Pick a pinned commit where following the skill visibly changes the output.
2. Add a grader in `assertions/` with canned good/bad samples in `fixtures/`
   and cases in `scripts/test-grader.mjs`; make the grader tests pass before
   burning agent tokens.
3. Add a promptfoo config wiring the provider, the grader, and an `llm-rubric`
   for the judgment calls regexes can't make.
