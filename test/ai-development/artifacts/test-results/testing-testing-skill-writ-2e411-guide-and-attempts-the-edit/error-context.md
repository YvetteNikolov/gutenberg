# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: testing.spec.mjs >> testing skill >> writing an e2e test consults the authoring guide and attempts the edit
- Location: test/ai-development/specs/testing.spec.mjs:59:2

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  1  | /**
  2  |  * Verifies agents follow the `skills/testing` skill: read the right guidance,
  3  |  * skip the unrelated references, and reach for scoped, headless commands.
  4  |  *
  5  |  * Every test spawns a real agent session (minutes and real tokens). Run only
  6  |  * via `npm run test:ai-development` — see ../README.md.
  7  |  */
  8  | 
  9  | /**
  10 |  * External dependencies
  11 |  */
  12 | import { test, expect } from '@playwright/test';
  13 | 
  14 | /**
  15 |  * Internal dependencies
  16 |  */
  17 | import { runAgent } from '../agent.mjs';
  18 | 
  19 | test.describe( 'testing skill', () => {
  20 | 	test( 'running e2e tests for a block follows the skill', async () => {
  21 | 		const transcript = runAgent(
  22 | 			'Run the e2e tests for the paragraph block',
  23 | 			{ name: 'testing-run-e2e' }
  24 | 		);
  25 | 		const e2eCommands = transcript
  26 | 			.commandsMatching( 'test:e2e' )
  27 | 			.join( '\n' );
  28 | 
  29 | 		// Discovery chain: the skill and its e2e reference, not the others.
  30 | 		expect
  31 | 			.soft( transcript.consulted( 'skills/testing/SKILL.md' ) )
  32 | 			.toBe( true );
  33 | 		expect
  34 | 			.soft( transcript.consulted( 'skills/testing/references/e2e.md' ) )
  35 | 			.toBe( true );
  36 | 		expect
  37 | 			.soft( transcript.reads )
  38 | 			.not.toContain( 'skills/testing/references/php.md' );
  39 | 		expect
  40 | 			.soft( transcript.reads )
  41 | 			.not.toContain( 'skills/testing/references/jest.md' );
  42 | 		expect
  43 | 			.soft( transcript.firstRead( 'skills/testing/SKILL.md' ) )
  44 | 			.toBeLessThan( transcript.firstCommand( 'test:e2e' ) );
  45 | 		expect
  46 | 			.soft( transcript.firstRead( 'skills/testing/references/e2e.md' ) )
  47 | 			.toBeLessThan( transcript.firstCommand( 'test:e2e' ) );
  48 | 
  49 | 		// Environment checked before started; run scoped and headless.
  50 | 		expect
  51 | 			.soft( transcript.firstCommand( 'wp-env-test status' ) )
  52 | 			.toBeLessThan( transcript.firstCommand( 'wp-env-test start' ) );
  53 | 		expect.soft( e2eCommands ).toContain( '.spec.js' );
  54 | 		expect.soft( e2eCommands ).not.toContain( '--headed' );
  55 | 		expect.soft( e2eCommands ).not.toContain( '--ui' );
  56 | 		expect.soft( e2eCommands ).not.toContain( '--debug' );
  57 | 	} );
  58 | 
  59 | 	test( 'writing an e2e test consults the authoring guide and attempts the edit', async () => {
  60 | 		// "Without asking" removes a headless-mode artifact (Codex proposes
  61 | 		// and waits for confirmation it can never receive); "do not run or
  62 | 		// build" keeps the session scoped to authoring — this spec asserts
  63 | 		// reads and the edit, not commands.
  64 | 		const transcript = runAgent(
  65 | 			'Add an e2e test for the paragraph block that checks that the `&` key is not output as `&amp;` in the editor. Make the edit directly without asking for confirmation. Do not run or build anything — just write the test.',
  66 | 			{ name: 'testing-write-e2e' }
  67 | 		);
  68 | 
  69 | 		// The skill chain plus the canonical authoring guide it points to.
  70 | 		expect
  71 | 			.soft( transcript.consulted( 'skills/testing/SKILL.md' ) )
  72 | 			.toBe( true );
  73 | 		expect
  74 | 			.soft( transcript.consulted( 'skills/testing/references/e2e.md' ) )
  75 | 			.toBe( true );
  76 | 		expect
  77 | 			.soft(
  78 | 				transcript.consulted( 'docs/contributors/code/e2e/README.md' )
  79 | 			)
  80 | 			.toBe( true );
  81 | 		expect
  82 | 			.soft( transcript.reads )
  83 | 			.not.toContain( 'skills/testing/references/php.md' );
  84 | 		expect
  85 | 			.soft( transcript.reads )
  86 | 			.not.toContain( 'skills/testing/references/jest.md' );
  87 | 
  88 | 		// The agent must actually attempt the spec edit — without this, an
  89 | 		// agent that only proposes a test and asks for confirmation (as
  90 | 		// Codex does in a read-only sandbox) would pass with no write at all.
> 91 | 		expect.soft( transcript.attemptedWrite( '.spec.js' ) ).toBe( true );
     |                                                          ^ Error: expect(received).toBe(expected) // Object.is equality
  92 | 	} );
  93 | } );
  94 | 
```