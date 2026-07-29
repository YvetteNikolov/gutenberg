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
provider and runtime errors still do. Output goes to `results/` (gitignored) and
to promptfoo's own store, browsable with `promptfoo view`.

## Files

| Path                   | Contents                                                                       |
| ---------------------- | ------------------------------------------------------------------------------ |
| `promptfooconfig.yaml` | Providers, sandboxing, concurrency, output. One config holds every agent.      |
| `prompt.md`            | The task given to the agent.                                                   |
| `tests.yaml`           | The cases and their assertions — what is actually measured.                    |
| `fixture-repo.mjs`     | The commit under test, plus any overlay applied to the tree.                   |
| `agent-provider.mjs`   | Builds the fixture, hands it to a built-in promptfoo provider, cleans up.      |
| `build-fixture.mjs`    | Rebuilds any commit as a disposable repository. Knows nothing about this eval. |

## Adding a test case

Add an entry to `tests.yaml`. Assertions describe what the agent should have
done, not what it should have said.

Process assertions read `metadata.toolCalls`, which promptfoo normalises across
agents. Reach it with an assertion `transform`:

```yaml
- type: contains
  transform: JSON.stringify(context.metadata?.toolCalls ?? [])
  value: skills/testing/references/e2e.md
  metric: Read the e2e reference
```

Note that `skill-used` will not work here. It reads `metadata.skillCalls`, which
only populates for skills the agent SDK registers from `.claude/skills` — a
repository's `skills/` directory is found by searching, so that stays empty.

If a case needs the agent to write files, add the tools to
`append_allowed_tools`. Setting `working_dir` narrows the default allowlist to
`Read`/`Grep`/`Glob`/`LS`, and an agent that cannot write will stop and ask for
permission that nothing can grant.

## Adding another eval

Give each eval its own directory holding a `promptfooconfig.yaml`, `prompt.md`,
`tests.yaml` and `fixture-repo.mjs`, and pass `--config <dir>/promptfooconfig.yaml`.
`agent-provider.mjs` and `build-fixture.mjs` stay at this level and are shared;
`file://` references to them gain a `../`.

The current layout is flat because promptfoo auto-discovers a config only in the
working directory, which is what lets `npm run test:agent-evals` run without
arguments.

## Debugging a run

`promptfoo view` shows each cell's full output and which assertion failed.

To see what an agent loaded at startup — settings sources, skills, tools — set
`debug: true` and `debug_file: results/agent.log` in `provider_config`. That is
the agent SDK's own log; promptfoo does not surface any of it.

Two things that have caused confusing failures:

-   The agent SDKs must stay direct devDependencies. promptfoo declares them
    optional and resolves them from this directory, so a copy nested under
    `promptfoo/node_modules` is not found.
-   Agents read `~/.claude/skills` regardless of `setting_sources`, so a personal
    skill on the machine can reach a run.
