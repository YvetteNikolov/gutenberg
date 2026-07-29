# Agent skill evals

A [promptfoo](https://promptfoo.dev) harness for measuring whether the agent
skills in `skills/` are discovered and followed.

## The one architectural rule

**The fixture is ours. Everything else is promptfoo's.**

Rebuilding a Gutenberg commit into a throwaway repository is something promptfoo
cannot know about, so we own it. Running an agent, capturing its tool calls, and
normalising those calls across vendors are solved problems, so we do not.

promptfoo's built-in agent providers populate `metadata.toolCalls` and
`metadata.skillCalls`, and its assertions read them. Nothing here parses a raw
shell string or defines its own transcript shape.

```text
testing/promptfooconfig.yaml
        │
        ├─ providers ──► shared/agent-provider.mjs      (ours, ~130 lines)
        │                   │
        │                   ├─ build fixture ──────────► testing/fixture-repo.mjs
        │                   │                               └─► shared/fixture-repo.mjs
        │                   ├─ delegate ───────────────► anthropic:claude-code
        │                   │                             openai:codex-sdk   (promptfoo)
        │                   └─ clean up
        │
        └─ tests ──────► built-in assertions only
```

The package depends on `promptfoo` and nothing else — no agent SDKs, because we
no longer invoke them.

## Why the wrapper provider exists

It is the only custom runtime code, and it exists for one reason: the fixture
must be built per run, and promptfoo offers no seam for that.

-   `extensions` `beforeEach` hooks receive only `{ test }` — no provider — so a
    hook cannot vary the fixture per provider.
-   Provider config is not rendered with test vars, and providers are
    instantiated once per suite, so a per-run `working_dir` cannot be passed
    through config.

So the wrapper builds the fixture, sets `working_dir`, confines the sandbox to
it, hands off to the native provider, and deletes the fixture in a `finally`. It
does not touch the agent's output or metadata beyond recording which fixture
commit the run saw.

If promptfoo later exposes the provider in extension hooks, or renders provider
config per test, this file can be deleted.

## Layers

| Path                            | Owns                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `shared/agent-provider.mjs`     | Fixture lifecycle and delegation. Agent-agnostic — `provider:` names the native promptfoo provider. |
| `shared/fixture-repo.mjs`       | Rebuilding a commit as a disposable repo. Knows nothing about any eval.                             |
| `<target>/fixture-repo.mjs`     | The commit under test, and any per-target overlay.                                                  |
| `<target>/promptfooconfig.yaml` | Everything else: prompt, providers, assertions.                                                     |

One config per target holds every agent, so the prompt and assertions cannot
drift between them. Adding an agent is a provider block; adding a target is a
directory with two files.

## The testing eval

`skills/testing/SKILL.md` is a router: it defers to `references/jest.md`,
`references/php.md` or `references/e2e.md` depending on the kind of test. The
eval asks for an end-to-end test and checks the agent takes the e2e branch and
leaves the other two unread — a progressive-disclosure check.

`skill-used` cannot express this, because the skill is `testing` either way and
the distinction is which reference was opened. So each assertion uses
`transform` to reach `metadata.toolCalls` and matches a path with a built-in
`contains` / `not-contains`. No custom assertion files.

## Isolation

Subject agents run in a disposable repository with network and web search
disabled, and may write only inside that fixture, which is deleted afterwards.
The developer's checkout is never the working directory. The fixture is built by
`git archive`, so it contains only tracked files — this eval's own config is
never visible to the agent.

Isolation is configured on the native providers (`sandbox`, `sandbox_mode`,
`network_access_enabled`, `setting_sources`) rather than enforced by our code.
The Claude `sandbox` block is forwarded to the Claude Agent SDK verbatim, so it
uses the SDK's camelCase keys while everything else in `provider_config` is
snake_case; the wrapper fills in its filesystem allowlists with the fixture path.

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

# Validate every target's wiring without running agents.
npm --prefix test/ai-development/evals run validate

# Live run (minutes + real tokens). Add --filter-providers to pick one agent.
npm run test:agent-evals testing/promptfooconfig.yaml
npm run test:agent-evals testing/promptfooconfig.yaml -- --filter-providers claude

# Results table, transcripts and per-run detail.
npm --prefix test/ai-development/evals run view
```

Eval runs keep assertion failures in the report but do not fail the process on a
red row. Provider and runtime errors still fail the command.

`results/` is gitignored.

## Adding an eval target

1. Add a directory named for the skill under test.
2. Add `fixture-repo.mjs` exporting `createFixtureRepository`, composing
   `shared/fixture-repo.mjs`. Pass an `overlay` callback if the fixture needs
   files added or removed beyond what the commit already contains.
3. Add `promptfooconfig.yaml` with a provider block per agent, and assertions —
   preferring built-ins (`skill-used`, `trajectory:*`, `word-count`,
   `contains`), reaching `metadata` via `transform` where a path or tool
   argument is what matters.

No shared code or `package.json` changes are needed.
