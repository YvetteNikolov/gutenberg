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

# Check every suite's config without running agents.
npm --prefix test/ai-development/evals run validate

# Live run (minutes + real tokens). No argument runs every suite.
npm run test:agent-evals

# A path runs one suite; flags pass through either way.
npm run test:agent-evals -- suites/testing-skill-routing/promptfooconfig.yaml
npm run test:agent-evals -- --filter-providers claude
npm run test:agent-evals -- suites/testing-skill-routing/promptfooconfig.yaml --repeat 3

# Results table, transcripts, per-run detail.
npm --prefix test/ai-development/evals run view
```

npm needs the `--` before any argument. Everything after it goes to
`lib/run.sh`, which follows the jest convention: optional leading path, then
flags.

Runs report assertion failures but do not fail the process on a red row;
provider and runtime errors still do. Output goes to `results/` (gitignored) and
to promptfoo's own store, browsable with `promptfoo view`.

## Layout

```text
lib/                            harness — rarely touched
├── agent-provider.mjs          builds the fixture, hands it to a promptfoo provider, cleans up
├── build-fixture.mjs           rebuilds any commit as a disposable repository
└── run.sh                      resolves which suites to run
suites/
└── testing-skill-routing/      one directory per eval
    ├── promptfooconfig.yaml    providers, sandboxing, concurrency, output
    ├── prompt.md               the task given to the agent
    ├── tests.yaml              cases and assertions — what is measured
    └── fixture.mjs             the commit under test, plus any overlay
```

A suite is self-contained: it names its fixture by bare filename, because
`fixture_module` resolves relative to the config that declares it.

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

## Adding a suite

Copy `suites/testing-skill-routing/`, rename it, and edit its four files.
Nothing in `lib/` or `package.json` needs to change — `run.sh` and `validate`
both glob `suites/*/promptfooconfig.yaml`.

Start each config with the schema comment for editor autocomplete:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
```

Once a suite outgrows a single `tests.yaml`, promptfoo will glob a directory
instead: `tests: file://tests/*`.

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
