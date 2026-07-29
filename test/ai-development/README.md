# AI development tests

This directory tests Gutenberg's AI-assisted development workflows for effectiveness and efficiency.

## Current suite

The standalone `evals/` package uses [Promptfoo](https://www.promptfoo.dev/docs/) to run coding agents against isolated temporary repositories.

## How it works

Promptfoo runs the prompt × provider × test × repeat matrix. Its standard lifecycle hooks create a clean Git workspace from the committed `HEAD` before each row and remove it afterward. The native Claude and Codex providers receive that directory as `working_dir`.

The subject workspace excludes `test/ai-development/evals/`, so the agent cannot inspect its prompt configuration or assertions. Uncommitted repository changes are not included.

See Promptfoo's [coding-agent guide](https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/) and [extension hooks](https://www.promptfoo.dev/docs/configuration/reference/#extension-hooks).

## Setup

Use Node.js 22.22 or newer; Node.js 24 LTS is recommended.

```bash
npm --prefix test/ai-development/evals install
```

A root `npm install` does not install this nested package.

Codex can use an existing Codex/ChatGPT login or `OPENAI_API_KEY`/`CODEX_API_KEY`. Claude can use an existing Claude Code login or `ANTHROPIC_API_KEY`. Model calls consume the associated quota or paid usage.

## Run

Run from the repository root:

```bash
# Validate configuration without model calls.
npm --prefix test/ai-development/evals run validate

# Run every suite and provider.
npm run test:agent-evals

# Run one suite.
npm run test:agent-evals -- suites/testing-skill-routing/promptfooconfig.yaml

# Run one provider.
npm run test:agent-evals -- suites/testing-skill-routing/promptfooconfig.yaml --filter-providers codex
npm run test:agent-evals -- suites/testing-skill-routing/promptfooconfig.yaml --filter-providers claude

# Override repeats.
npm run test:agent-evals -- suites/testing-skill-routing/promptfooconfig.yaml --repeat 3

# Open the local results viewer.
npm --prefix test/ai-development/evals run view
```

The runner disables Promptfoo telemetry and response caching. Assertion failures produce failed rows without a nonzero process exit; provider and runtime errors still fail the command. Treat the results table as the outcome.

Results under `evals/results/` are gitignored and may contain source code and tool output.

## Files

```text
evals/
├── lib/
│   ├── workspace-extension.mjs     beforeEach/afterEach workspace lifecycle
│   └── run.sh                      suite selection and shared CLI behavior
├── package.json
├── package-lock.json
└── suites/testing-skill-routing/
    ├── promptfooconfig.yaml        providers, tracing, permissions, repeats
    ├── prompt.md                   task shown to the agent
    └── tests.yaml                  assertions and named metrics
```

## Authoring

For each suite:

1. State the narrow claim the evaluation supports.
2. Write a realistic prompt that does not reveal the expected behavior.
3. Configure native providers and tracing in `promptfooconfig.yaml`.
4. Put cases and named metrics in `tests.yaml`.
5. Validate, run one provider once, then run the intended matrix with repeats.
