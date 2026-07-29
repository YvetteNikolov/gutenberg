# Agent evaluations

This package uses [Promptfoo](https://www.promptfoo.dev/docs/) to evaluate whether coding agents discover and follow Gutenberg's repository instructions. It is deliberately separate from the root npm workspace and has its own dependencies and lockfile.

Read the parent [AI development tests README](../README.md) first for when an agent evaluation is appropriate.

## What the current suite proves

`skills/testing/SKILL.md` routes an agent to one of three references: Jest, PHPUnit, or end-to-end testing. The `testing-skill-routing` suite asks an agent to add an end-to-end test and checks its normalized tool trace for two things:

-   The agent read `skills/testing/references/e2e.md`.
-   The agent did not read the Jest or PHPUnit references.

This is a routing evaluation. A passing row does **not** prove that the agent wrote the requested test, that the test passes, or that the resulting code is correct. Promptfoo records the final response and trace, then the lifecycle extension deletes the workspace; it does not preserve the workspace's final diff for assertions.

## Mental model

Promptfoo evaluates the matrix of prompts, providers, test cases, and repeats declared by a suite. The current suite has one prompt, two providers, one test case, and two configured repeats, so an unfiltered run starts four real coding agent sessions.

For each session, Promptfoo:

1. Runs the `beforeEach` extension, which archives the current committed Gutenberg tree into a temporary Git repository.
2. Passes that repository to the native Claude Agent SDK or Codex SDK provider as `working_dir`.
3. Captures the final response and normalized trace.
4. Runs the `afterEach` extension, which deletes the temporary repository, including the agent's edits.

The subject agent cannot see this evaluation's prompt configuration, assertions, or expected results because `test/ai-development/evals/` is removed from its workspace. It also never works in your Gutenberg checkout.

For the underlying concepts, see Promptfoo's guides to [coding-agent evaluations](https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/), [configuration](https://www.promptfoo.dev/docs/configuration/guide/), and [assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/).

## Prerequisites

-   Use Node.js 22.22 or newer (Node.js 24 LTS is recommended) and the npm version declared in the root `package.json`. Promptfoo's runtime requirement is stricter than Gutenberg's current minimum Node.js version.
-   Install the eval package separately:

    ```bash
    npm --prefix test/ai-development/evals install
    ```

    A root `npm install` does not install this nested package.

-   Commit the repository state you intend to evaluate. Workspaces are built from the current `HEAD`; uncommitted changes are not included.
-   Authenticate the provider you intend to run:
    -   Codex can reuse an existing Codex/ChatGPT login when no API key is set, or use `OPENAI_API_KEY`/`CODEX_API_KEY`.
    -   Claude can reuse an existing Claude Code login because the suite sets `apiKeyRequired: false`, or use `ANTHROPIC_API_KEY`.

See Promptfoo's provider documentation for [Codex SDK setup](https://www.promptfoo.dev/docs/providers/openai-codex-sdk/#setup) and [Claude Agent SDK setup](https://www.promptfoo.dev/docs/providers/claude-agent-sdk/#setup). Model calls consume the quota or paid usage associated with those credentials.

## Run the evaluations

Run commands from the repository root:

```bash
# Validate every suite without starting an agent or spending model tokens.
npm --prefix test/ai-development/evals run validate

# Run every suite and every configured provider.
npm run test:agent-evals

# Run one suite.
npm run test:agent-evals -- suites/testing-skill-routing/promptfooconfig.yaml

# Run one provider across the selected suite(s).
npm run test:agent-evals -- suites/testing-skill-routing/promptfooconfig.yaml --filter-providers codex
npm run test:agent-evals -- suites/testing-skill-routing/promptfooconfig.yaml --filter-providers claude

# Override the configured repeat count while investigating stability.
npm run test:agent-evals -- suites/testing-skill-routing/promptfooconfig.yaml --repeat 3

# Browse stored results, transcripts, and assertion details locally.
npm --prefix test/ai-development/evals run view
```

npm requires the `--` before forwarded arguments. Everything after it goes to `lib/run.sh`, which accepts an optional leading config path followed by Promptfoo CLI flags. With no path, the runner globs every `suites/*/promptfooconfig.yaml`.

The runner disables Promptfoo telemetry and response caching. Assertion failures produce red rows but intentionally do not make the process exit nonzero; provider and runtime errors still do. Treat the results table, not the shell status alone, as the evaluation outcome.

Raw JSON is written under `results/raw/`, and Promptfoo also records the run in its local store for the [web viewer](https://www.promptfoo.dev/docs/usage/web-ui/). `results/` is gitignored. Transcripts may contain source code and tool output; inspect them before sharing or moving them outside your machine.

## Repository layout

```text
lib/
├── workspace-extension.mjs     Promptfoo workspace setup and cleanup hooks
└── run.sh                      Suite selection and shared CLI behavior
suites/
└── testing-skill-routing/
    ├── promptfooconfig.yaml    Provider matrix, permissions, repeats, output
    ├── prompt.md               Task shown to the subject agent
    └── tests.yaml              Cases, assertions, and named metrics
```

Each suite is self-contained. `file://` paths resolve relative to the suite config, so a suite can refer to `prompt.md` and `tests.yaml` by bare filename.

`workspace-extension.mjs` uses Promptfoo's standard `beforeEach`, `afterEach`, and `afterAll` lifecycle hooks. It creates one clean workspace per matrix row, injects `working_dir` and Claude's dynamic filesystem allowlists into the test options, and cleans up even when a later row fails.

## Add or change a suite

Before editing, state the narrow claim the evaluation should support. Decide whether it concerns the final response, the agent's trajectory, or its resulting files. The current harness exposes the first two. To assert on resulting files, extend the lifecycle hook to capture the needed artifact or diff before workspace cleanup.

For a new suite:

1. Copy `suites/testing-skill-routing/` to a descriptively named directory.
2. Write a realistic task in `prompt.md`. Do not reveal the expected route or assertion in the prompt.
3. Configure providers, permissions, repeats, concurrency, and output in `promptfooconfig.yaml`.
4. Put the measurable claim and named metrics in `tests.yaml`.
5. Validate the config, then run one provider and one repeat while iterating.
6. Run the intended provider matrix with multiple repeats before drawing a conclusion.

No registration is needed: the runner and validator discover `suites/*/promptfooconfig.yaml`. Start every config with the schema comment for editor validation:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
```

If a suite needs multiple test files, Promptfoo accepts a glob such as:

```yaml
tests: file://tests/*
```

## Write assertions against agent behavior

Enable Promptfoo tracing and assert against its normalized trajectory instead of provider response metadata:

```yaml
- type: trajectory:step-count
  value:
      type: command
      pattern: '*skills/testing/references/e2e.md*'
      min: 1
  metric: Read the e2e reference
```

Use named `metric` values so repeated results aggregate intelligibly in the viewer. Prefer deterministic assertions over grading another model when the trace or output contains direct evidence.

`skill-used` is not appropriate for the current Gutenberg routing suite. Promptfoo populates `metadata.skillCalls` for skills registered through the agent SDK's recognized skill locations. Gutenberg's root `skills/` directory is instead discovered through repository instructions, so the relevant evidence is the selected reference-file read.

Promptfoo normalizes trace spans into common trajectory step types, but it does not turn every vendor-specific filesystem tool into one semantic "file read." Claude normally exposes a `Read` tool while Codex reads through `exec_command`. This suite gives Claude a sandboxed `Bash` tool for reads and adds `Bash` to `tracing.commandToolNames`; Promptfoo can then classify both providers' reads as `command` steps and apply the same assertions. Codex also needs `enable_streaming` to emit its normalized trajectory spans.

Tool permissions are part of the test setup. Claude's configured `working_dir` starts with read-only tools; this suite replaces that default with Bash, Edit, and Write through the SDK's `tools` option, so reads share the normalized command path and the task can still edit files. `custom_allowed_tools` controls permission, not which tools are exposed. Keep provider filesystem access confined to the temporary workspace and keep agent shell network access disabled.

## Debug failures and flaky results

Open the viewer first. A cell shows the final response, tool trace, token usage, and the reason each assertion passed or failed.

To capture Claude Agent SDK startup details such as settings sources, skills, and tools, temporarily add these keys under that provider's `config`:

```yaml
debug: true
debug_file: results/agent.log
```

That file is produced by the agent SDK; Promptfoo does not include it in the normal result cell.

Check these common causes:

-   **Authentication error:** verify the selected provider works with the same local login or API key outside the evaluation.
-   **Workspace error:** verify the committed `HEAD` contains the scenario and that local `git archive`, `tar`, and temporary-directory creation work.
-   **Permission or sandbox error:** compare the requested task with the configured write tools, sandbox support, and network restrictions.
-   **A surprising route:** inspect the trace timeline; the final response alone does not show which guidance the agent read.
-   **Intermittent failure:** run a single provider with several repeats before changing the prompt or assertion.
-   **Machine-specific behavior:** Claude and Codex can still discover user-level configuration or skills from their normal home directories. Project-only Claude setting sources reduce this but do not fully isolate user-level skill files. Reproducible CI will require dedicated agent home directories and credentials.
-   **Provider load failure:** keep `@anthropic-ai/claude-agent-sdk` and `@openai/codex-sdk` as direct dev dependencies. Promptfoo declares them optional and resolves them from this package.
