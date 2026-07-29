# AI development tests

This directory contains test infrastructure for the repository's AI-assisted
development workflows. These tests answer questions about how a coding agent
works in Gutenberg—for example, whether it discovers the right instructions—not
whether Gutenberg production code behaves correctly.

Start with:

-   [Agents and Skills](/docs/contributors/code/agents-and-skills.md) for the
    repository's instruction hierarchy and progressive-discovery model.
-   [Testing Overview](/docs/contributors/code/testing-overview.md) for the
    principles shared by all Gutenberg tests.
-   [Agent evals](./evals/README.md) for setup, execution, and authoring details.

## Contents

| Path                 | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| [`evals/`](./evals/) | Promptfoo evaluations that run coding agents against disposable repos. |

## How these tests differ from conventional tests

Agent evaluations are slower, stochastic, and can consume paid model usage.
Their results can also depend on the provider, model, authentication method,
agent SDK, and user-level agent configuration. Run a focused provider and suite
while developing, then repeat the completed evaluation enough times to expose
intermittent behavior.

Use the narrowest test that answers the question:

-   Prefer deterministic JavaScript, PHP, or end-to-end tests for production
    behavior.
-   Use an agent evaluation when the behavior under test requires an agent's
    instruction discovery, tool use, or multi-step decisions.
-   Name the exact behavior an evaluation measures. A routing assertion does
    not prove that the agent's final code is correct.

## Working in this directory

The evaluation runner must not use the contributor's checkout as the subject
workspace. Each subject agent receives a temporary repository, constrained
tools, and no network access from its shell. Keep prompts, expected behavior,
and evaluation-only data outside that repository so the agent cannot read its
own answer.

The Promptfoo project under `evals/` has its own dependencies and lockfile. It
is intentionally installed and run separately from the root npm workspace; see
its README for the exact commands.
