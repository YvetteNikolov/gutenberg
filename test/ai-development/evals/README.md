# Agent skill evals

[promptfoo](https://promptfoo.dev) evals that measure whether the agent skills
in `skills/` are actually discovered and followed by a coding agent.

## What this eval measures

`skills/testing/SKILL.md` is a router: it defers to `references/jest.md`,
`references/php.md` or `references/e2e.md` depending on the kind of test being
written. The eval asks an agent to add an end-to-end test, then checks it read
the e2e reference and left the other two alone.

Each agent runs against a throwaway repository built from a pinned commit, so a
run cannot touch your checkout and cannot see this eval's own configuration.

## Running

```bash
npm --prefix test/ai-development/evals install

# Check the config without running agents.
npm --prefix test/ai-development/evals run validate

# Live run (minutes + real tokens), both agents.
npm run test:agent-evals

# One agent.
npm run test:agent-evals:claude
npm run test:agent-evals:codex

# Any promptfoo flag — note the `--`, which npm requires before flags.
npm run test:agent-evals -- --filter-pattern ampersand

# Results table, transcripts, per-run detail.
npm --prefix test/ai-development/evals run view
```

Runs report assertion failures but do not fail the process on a red row;
provider and runtime errors still do. Output goes to `results/`, which is
gitignored, and to promptfoo's own store (`promptfoo list evals`,
`promptfoo view`).

## Files

| Path                   | Contents                                                                       |
| ---------------------- | ------------------------------------------------------------------------------ |
| `promptfooconfig.yaml` | Providers, sandboxing, concurrency, output. One config holds every agent.      |
| `prompt.md`            | The task given to the agent.                                                   |
| `tests.yaml`           | The cases and their assertions — what is actually measured.                    |
| `fixture-repo.mjs`     | The commit under test, plus any overlay applied to the tree.                   |
| `agent-provider.mjs`   | Builds the fixture, hands it to a built-in promptfoo provider, cleans up.      |
| `build-fixture.mjs`    | Rebuilds any commit as a disposable repository. Knows nothing about this eval. |

The agent itself is run by promptfoo's built-in providers
(`anthropic:claude-code`, `openai:codex-sdk`), which normalise tool calls into
`metadata.toolCalls`. `agent-provider.mjs` exists only because the fixture has
to be built per run and promptfoo has no hook that can do that — it sets
`working_dir` and otherwise passes everything through untouched.

## Gotchas

These are all load-bearing; each one produced a confusing failure at least once.

-   **The agent SDKs must stay direct devDependencies.** promptfoo declares them
    `optional` and resolves them from _this_ directory, so a copy nested under
    `promptfoo/node_modules` will not be found.
-   **Setting `working_dir` silently restricts tools** to `Read`/`Grep`/`Glob`/`LS`.
    Anything that needs to write must add `append_allowed_tools`, or the agent
    stops and asks for permission that nothing can grant.
-   **`apiKeyRequired: false`** lets the Claude CLI use its normal login instead
    of demanding a separate `ANTHROPIC_API_KEY`.
-   **`skills/` is not a Claude Code skills directory.** The SDK looks in
    `.claude/skills`; agents find `skills/` by searching the repo. So
    `metadata.skillCalls` stays empty and the `skill-used` assertion never fires
    — assert against `metadata.toolCalls` instead, via an assertion `transform`.
-   **Agents still read `~/.claude/skills`.** `setting_sources` gates settings,
    not skills, so a personal skill on the machine can reach a run.
-   **YAML merge keys (`<<:`) are not resolved** by promptfoo's parser; an
    anchored provider block yields a silently undefined provider.

To see what an agent loaded at startup, set `debug: true` and
`debug_file: results/agent.log` in `provider_config` — the SDK's init log records
settings sources, skills and tools, none of which promptfoo surfaces.

## Adding another eval

The layout is flat and single-eval, because promptfoo only auto-discovers a
config in the working directory and that is what makes `npm run test:agent-evals`
work without arguments.

A second eval means giving each one a directory holding its own
`promptfooconfig.yaml`, `prompt.md`, `tests.yaml` and `fixture-repo.mjs`, and
passing `--config <dir>/promptfooconfig.yaml` again. `agent-provider.mjs` and
`build-fixture.mjs` stay here and are shared; `file://` references to them gain
a `../`.

Prefer promptfoo's built-in assertions (`skill-used`, `trajectory:*`,
`word-count`, `contains`), reaching provider metadata via an assertion
`transform` where a path or tool argument is what matters. Drop to a
`javascript` assertion only where no built-in fits.
