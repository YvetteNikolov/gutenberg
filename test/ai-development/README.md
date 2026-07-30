# AI development tests

This directory tests Gutenberg's AI-assisted development workflows for effectiveness and efficiency.

## Overview

The standalone `evals/` package uses [Promptfoo](https://www.promptfoo.dev/docs/) to run coding agents against isolated temporary repositories.

## How it works

Promptfoo runs the prompt × provider × test × repeat matrix. Its standard lifecycle hooks create a clean Git workspace from the committed `HEAD` before each row and remove it afterward. The native Claude and Codex providers receive that directory as `working_dir`.

```text
      prompt × provider × test
                 │
                 ▼
   beforeEach: create temporary repo
      from HEAD and hide eval files
                 │
                 ▼
       coding agent changes files
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
  tool calls         agent response 
                        + Git diff  
       │                   │
       └─────────┬─────────┘
                 ▼
         Promptfoo assertions
    ┌────────────┼────────────┐
    ▼            ▼            ▼
 tool-call  deterministic  agent-rubric
  checks     code checks     review
    └────────────┼────────────┘
                 ▼
       result row and metrics
                 │
                 ▼
      afterEach: delete workspace
```

The subject workspace excludes `test/ai-development/evals/`, so the agent cannot inspect its prompt configuration or assertions. Uncommitted repository changes are not included.

See Promptfoo's [coding-agent guide](https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/) and [extension hooks](https://www.promptfoo.dev/docs/configuration/reference/#extension-hooks).

### Grading code changes

Promptfoo's default is to grade the agent's final message, not the files it changed. We need to grade the code as well. A shared output transform captures the changed-file list and Git diff before cleanup. Deterministic JavaScript assertions then grade that artifact as separate named Promptfoo metrics, while the raw diff remains available in the result.

Promptfoo's built-in `agent-rubric` complements these exact checks by reviewing the live workspace for broader quality and correctness.

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

# Test deterministic graders without model calls.
npm --prefix test/ai-development/evals test

# Run every suite and provider.
npm run test:agent-evals

# Run one suite.
npm run test:agent-evals -- suites/SUITE_NAME/promptfooconfig.yaml

# Run one provider.
npm run test:agent-evals -- suites/SUITE_NAME/promptfooconfig.yaml --filter-providers codex
npm run test:agent-evals -- suites/SUITE_NAME/promptfooconfig.yaml --filter-providers claude

# Override repeats.
npm run test:agent-evals -- suites/SUITE_NAME/promptfooconfig.yaml --repeat 3

# Open the local results viewer.
npm --prefix test/ai-development/evals run view
```

The runner disables Promptfoo telemetry and response caching. Assertion failures produce failed rows without a nonzero process exit; provider and runtime errors still fail the command. Treat the results table as the outcome.

Results under `evals/results/` are gitignored and may contain source code and tool output.

## Files

```text
evals/
├── lib/
│   ├── default-test.yaml           shared test options
│   ├── providers.yaml              shared coding agents
│   ├── run.sh                      suite runner
│   ├── workspace-artifact.mjs      Git artifact capture and parsing
│   ├── workspace-artifact.test.mjs tests for artifact handling
│   └── workspace-extension.mjs     workspace lifecycle
├── package.json
├── package-lock.json
└── suites/SUITE_NAME/
    ├── artifact-grader.mjs        optional deterministic artifact checks
    ├── artifact-grader.test.mjs   tests for the artifact checks
    ├── promptfooconfig.yaml        providers, tracing, permissions, repeats
    ├── prompt.md                   task shown to the agent
    └── tests.yaml                  assertions and named metrics
```

## Authoring

For each suite:

1. State the narrow claim the evaluation supports.
2. Write a realistic prompt that does not reveal the expected behavior.
3. Reference the shared providers and configure tracing in `promptfooconfig.yaml`.
4. Put cases and named metrics in `tests.yaml`.
5. Validate, run one provider once, then run the intended matrix with repeats.
