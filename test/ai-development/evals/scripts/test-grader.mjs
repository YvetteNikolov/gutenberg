/**
 * Unit tests for the deterministic grader — run these before spending agent
 * tokens on a live eval. Each case pairs a canned PR description with fake
 * transcript metadata and asserts which components pass and fail.
 *
 *   node scripts/test-grader.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire( import.meta.url );
const evalsDir = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const { gradePrDescription } = require(
	path.join( evalsDir, 'assertions', 'grade-pr-description.cjs' )
);

const fixture = ( name ) =>
	fs.readFileSync(
		path.join( evalsDir, 'fixtures', 'pr-descriptions', name ),
		'utf8'
	);

const fullTranscript = {
	fixtureCommit: 'abc123',
	reads: [
		'/repo/skills/pull-requests/SKILL.md',
		'/repo/.github/PULL_REQUEST_TEMPLATE.md',
	],
	commands: [ 'git show HEAD' ],
};

const cases = [
	{
		name: 'good description with full transcript passes everything',
		output: fixture( 'good.md' ),
		metadata: fullTranscript,
		expectPass: true,
		expectFailing: [],
	},
	{
		name: 'native Skill invocation counts as hitting the skill',
		output: fixture( 'good.md' ),
		metadata: {
			fixtureCommit: 'abc123',
			reads: [ '/repo/.github/PULL_REQUEST_TEMPLATE.md' ],
			commands: [ 'git show HEAD' ],
			skillInvocations: [ '{"command":"pull-requests"}' ],
		},
		expectPass: true,
		expectFailing: [],
	},
	{
		name: 'good description, but the agent never consulted skill/template/diff',
		output: fixture( 'good.md' ),
		metadata: { reads: [], commands: [] },
		expectPass: false,
		expectFailing: [
			'Hit the skill',
			'Read the template',
			'Inspected the diff',
		],
	},
	{
		name: 'vague file inventory fails structure and rules checks',
		output: fixture( 'bad-file-inventory.md' ),
		metadata: fullTranscript,
		expectPass: false,
		expectFailing: [
			'Template sections',
			'Keyboard testing',
			'Observable steps',
			'No setup boilerplate',
			'AI disclosure',
		],
	},
	{
		name: 'boilerplate-heavy description fails setup and keyboard checks',
		output: fixture( 'bad-boilerplate.md' ),
		metadata: fullTranscript,
		expectPass: false,
		expectFailing: [
			'Keyboard testing',
			'Observable steps',
			'No setup boilerplate',
			'AI disclosure',
		],
	},
	{
		name: 'an empty keyboard section does not count as keyboard testing',
		output: fixture( 'good.md' ).replace(
			/### Testing Instructions for Keyboard[\s\S]*?(?=## Use of AI Tools)/,
			'### Testing Instructions for Keyboard\n\n'
		),
		metadata: fullTranscript,
		expectPass: false,
		expectFailing: [ 'Keyboard testing' ],
	},
	{
		name: 'a vague expected-result sentence is not observable',
		output: fixture( 'good.md' ).replace(
			/## Testing Instructions[\s\S]*?(?=### Testing Instructions for Keyboard)/,
			'## Testing Instructions\n\n1. Confirm everything works as expected.\n\n'
		),
		metadata: fullTranscript,
		expectPass: false,
		expectFailing: [ 'Observable steps' ],
	},
	{
		name: 'mentioning git show without running it does not count as inspecting the diff',
		output: fixture( 'good.md' ),
		metadata: {
			...fullTranscript,
			commands: [ 'echo git show HEAD' ],
		},
		expectPass: false,
		expectFailing: [ 'Inspected the diff' ],
	},
];

let failures = 0;
for ( const testCase of cases ) {
	const result = gradePrDescription( testCase.output, {
		metadata: testCase.metadata,
	} );
	const failing = result.componentResults
		.filter( ( component ) => ! component.pass )
		.map( ( component ) => component.reason.split( ':' )[ 0 ] );

	const passOk = result.pass === testCase.expectPass;
	const failingOk =
		JSON.stringify( failing.sort() ) ===
		JSON.stringify( [ ...testCase.expectFailing ].sort() );

	if ( passOk && failingOk ) {
		console.log( `PASS  ${ testCase.name }` );
	} else {
		failures += 1;
		console.log( `FAIL  ${ testCase.name }` );
		console.log(
			`      expected pass=${
				testCase.expectPass
			} failing=[${ testCase.expectFailing.join( ', ' ) }]`
		);
		console.log(
			`      actual   pass=${ result.pass } failing=[${ failing.join(
				', '
			) }]`
		);
	}
}

process.exit( failures === 0 ? 0 : 1 );
