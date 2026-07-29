# Agent skill evals

A [promptfoo](https://promptfoo.dev) harness for measuring whether the agent
skills in `skills/` are discovered and followed.

**This is currently a scaffold.** The wiring is real; what the eval measures is
a placeholder. See [Filling in an eval](#filling-in-an-eval).

## The one architectural rule

**The fixture is ours. Everything else is promptfoo's.**

Rebuilding a historical Gutenberg commit into a throwaway repository, with a
guidance variant overlaid, is something promptfoo cannot know about — so we own
it. Running an agent, capturing its tool calls, and normalising those calls
across vendors are solved problems, so we do not.

Concretely, promptfoo's built-in agent providers populate
`metadata.toolCalls` and `metadata.skillCalls`, and its `skill-used`,
`trajectory:*` and `word-count` assertions read them. Nothing here parses a raw
shell string or defines its own transcript shape.

```text
promptfooconfig.<agent>.yaml
        │
        ├─ providers ──► shared/agent-provider.mjs        (ours: ~130 lines)
        │                   │
        │                   ├─ build fixture ────────────► pull-requests/fixture-repo.mjs
        │                   │                                  └─► shared/fixture-repo.mjs
        │                   ├─ delegate ─────────────────► anthropic:claude-code
        │                   │                               openai:codex-sdk    (promptfoo)
        │                   └─ merge fixture metadata, clean up
        │
        └─ defaultTest ─► default-test.yaml                (promptfoo built-ins only)
```

The package depends on `promptfoo` and nothing else — no agent SDKs, because
we no longer invoke them.

## Why the wrapper provider exists

It is the only custom runtime code, and it exists for one reason: the fixture
must be built per run _and_ per provider, and promptfoo offers no seam for that.

-   `extensions` `beforeEach` hooks receive only `{ test }` — no provider — so a
    hook cannot know whether to build the candidate or the control fixture.
-   Provider config is not rendered with test vars, and providers are
    instantiated once per suite, so a per-run `working_dir` cannot be passed
    through config.

So the wrapper builds the fixture, sets `working_dir`, hands off to the native
provider, and deletes the fixture in a `finally`. It does not touch the agent's
output or metadata beyond adding four fields the reporter needs.

If promptfoo later exposes the provider in extension hooks, or renders provider
config per test, this file can be deleted.

## Layers

| Path                                   | Owns                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `shared/agent-provider.mjs`            | Fixture lifecycle and delegation. Agent-agnostic — `provider:` names the native promptfoo provider.            |
| `shared/fixture-repo.mjs`              | Rebuilding any commit as a disposable two-commit repo. Knows nothing about any eval.                           |
| `shared/summarize-results.mjs`         | The candidate-control delta — the only analysis promptfoo does not do. Use `npm run view` for everything else. |
| `pull-requests/fixture-repo.mjs`       | The guidance overlay this target varies, and `TARGET_COMMIT`.                                                  |
| `pull-requests/default-test.yaml`      | Grading contract, shared by both agent configs.                                                                |
| `pull-requests/prompt.md`              | Task prompt, shared by both agent configs.                                                                     |
| `pull-requests/promptfooconfig.*.yaml` | Only what is agent-specific: providers, description, `outputPath`.                                             |

Adding an agent is a config change. Adding an eval target means a new directory
with a fixture module, a prompt, and a grading contract — no shared code
changes.

## The candidate/control design

Each config runs the same task twice against fixtures that differ in exactly one
way:

-   **Candidate** — the skill and its `AGENTS.md` routing are present.
-   **Control** — both removed; every other repository instruction identical.

The per-metric delta between the two arms is the output that matters, not
whether any single row is green. `skill-used` is _expected_ to fail on the
control arm — that failure is the measurement.

The control fixture throws if the routing fragment it strips is not found in
`AGENTS.md`, so a reworded instruction cannot silently turn the control into a
duplicate of the candidate.

## Isolation

Subject agents run in a disposable repository with network and web search
disabled, and may write only inside that fixture, which is deleted afterwards.
The developer's checkout is never the working directory. The fixture contains
the Gutenberg source and guidance needed for the task, but not this eval's
configuration or grading contract.

Isolation is configured on the native providers (`sandbox_mode`,
`network_access_enabled`, `setting_sources`) rather than enforced by our code.

> **Unverified:** the `sandbox` sub-schema for `anthropic:claude-code` has not
> been confirmed against an installed 0.121.x. Network isolation for the Claude
> arm must be set before the first live run — see the `TODO` in
> `promptfooconfig.claude.yaml`. The Codex arm is fully specified.

## Conventions worth knowing

-   `file://` paths in a config resolve **relative to that config file's own
    directory** — hence `file://../shared/agent-provider.mjs`.
-   `fixture_module` is not a promptfoo path; the wrapper resolves it relative to
    the `evals/` root.
-   promptfoo's YAML parser does **not** resolve `<<:` merge keys. An anchored
    provider block yields a silently undefined provider, so blocks are spelled
    out.

## Running

```bash
npm --prefix test/ai-development/evals install

# Validate config wiring without running agents.
npm --prefix test/ai-development/evals run validate:pull-requests

# Live agent runs (minutes + real tokens each).
npm run test:agent-evals:pull-requests:claude
npm run test:agent-evals:pull-requests:codex

# Candidate-control delta per metric.
npm --prefix test/ai-development/evals run report

# Full results table, transcripts and per-run detail.
npm --prefix test/ai-development/evals run view
```

The eval scripts keep assertion failures in the report but do not fail the
process merely because a control row is red. Provider and runtime errors still
fail the command.

`results/` is gitignored.

### Node version

This package declares no `engines` of its own — promptfoo's own requirement
governs, and npm will tell you if your Node is too old. At the time of writing
that is `^20.20.0 || >=22.22.0`, and promptfoo drops Node 20 on 30 July 2026, so
in practice use Node 22 or newer here even though the repo's `.nvmrc` says `20`.

promptfoo pulls in `better-sqlite3`, which is compiled per Node major. If you
switch Node majors, `rm -rf node_modules && npm install` in this directory.

## Filling in an eval

The scaffold deliberately ships a placeholder rubric and a trivial
`trajectory:tool-used` assertion. To make it measure something:

1. Pick a pinned commit where following the skill visibly changes the output,
   and set `TARGET_COMMIT`.
2. Write the task prompt in `prompt.md`.
3. Build the grading contract in `default-test.yaml`, preferring built-ins
   (`skill-used`, `trajectory:*`, `word-count`, `contains-all`, `regex`) and
   dropping to a `javascript` assertion over `metadata.toolCalls` only where no
   built-in fits.
4. Add tests for whatever custom assertion code step 3 required.

## Adding an eval for a new skill

1. Add a directory named for the skill, following the `pull-requests/` shape.
2. Add a fixture module composing `shared/fixture-repo.mjs` with an `overlay`
   for the guidance being varied.
3. Add `prompt.md` and `default-test.yaml`.
4. Add thin Claude and Codex configs that set a unique `evaluation`, name the
   native `provider`, reference the target's `fixture_module`, and point
   `defaultTest` at the shared file.
5. Add the target's live commands to `package.json`.
