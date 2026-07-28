/**
 * Deterministic grader for the pull-requests skill eval.
 *
 * Checks two kinds of evidence:
 *  - Process (from provider metadata): the agent consulted the skill, the PR
 *    template, and the committed diff — not just its own priors.
 *  - Output: the description follows `.github/PULL_REQUEST_TEMPLATE.md` and
 *    the rules in `skills/pull-requests/SKILL.md` (succinct, observable
 *    testing steps, no setup boilerplate, AI-tools disclosure).
 *
 * Every component must pass (threshold: 1 in the promptfoo config).
 */

function check( label, passed, detail ) {
	return {
		pass: Boolean( passed ),
		score: passed ? 1 : 0,
		reason: `${ label }: ${ detail }`,
		namedScores: { [ label ]: passed ? 1 : 0 },
	};
}

function section( text, heading ) {
	// Content from `heading` to the next same-or-higher-level heading.
	const level = heading.match( /^#+/ )[ 0 ].length;
	const escaped = heading.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
	const pattern = new RegExp(
		`^${ escaped }\\s*$([\\s\\S]*?)(?=^#{1,${ level }} |(?![\\s\\S]))`,
		'm'
	);
	const match = text.match( pattern );
	return match ? match[ 1 ] : null;
}

function gradePrDescription( output, context ) {
	const text = String( output || '' );
	const metadata =
		context?.metadata || context?.providerResponse?.metadata || {};
	const evidence = [
		...( metadata.reads || [] ),
		...( metadata.commands || [] ),
	].join( '\n' );

	// Process checks: what did the agent actually consult?
	const hitSkill = /skills\/pull-requests\/SKILL\.md/.test( evidence );
	const readTemplate = /PULL_REQUEST_TEMPLATE\.md/.test( evidence );
	const inspectedDiff =
		Boolean( metadata.fixtureCommit ) &&
		( metadata.commands || [] ).some( ( command ) => {
			const escapedCommit = metadata.fixtureCommit.replace(
				/[.*+?^${}()|[\]\\]/g,
				'\\$&'
			);
			return String( command )
				.split( /&&|\|\||;|\|/ )
				.some( ( segment ) =>
					new RegExp(
						`^[\\s'"]*git\\s+(show|diff|log)\\b.*(HEAD|${ escapedCommit })`
					).test( segment )
				);
		} );

	// Output checks: does the description follow the template and our rules?
	const headings = [
		'## What?',
		'## Why?',
		'## How?',
		'## Testing Instructions',
	];
	const positions = headings.map( ( heading ) => text.indexOf( heading ) );
	const hasSections =
		positions.every( ( position ) => position !== -1 ) &&
		positions.every(
			( position, index ) =>
				index === 0 || position > positions[ index - 1 ]
		);

	const testing = (
		section( text, '## Testing Instructions' ) || ''
	).replace( /^### Testing Instructions for Keyboard[\s\S]*/m, '' );
	const keyboard =
		section( text, '### Testing Instructions for Keyboard' ) || '';
	const numberedSteps = testing.match( /^\s*\d+\.\s+.+$/gm ) || [];
	const keyboardSteps = keyboard.match( /^\s*\d+\.\s+.+$/gm ) || [];
	const observableResult = /\b(confirm|verify|check that|observe|ensure)\b/i;
	const vagueResult =
		/\b(things?|everything|it)\s+(works?|should work)\s+as expected\b/i;
	const hasObservableStep = ( steps ) =>
		steps.some(
			( step ) =>
				observableResult.test( step ) && ! vagueResult.test( step )
		);
	const observableSteps = hasObservableStep( numberedSteps );
	const hasKeyboard =
		keyboardSteps.length > 0 && hasObservableStep( keyboardSteps );

	const boilerplate = testing.match(
		/npm\s+(ci|install)\b|npm\s+run\s+(dev|build)\b|git\s+(checkout|clone|pull)\b|wp-env\s+start|node_modules/i
	);
	const noBoilerplate = testing.length > 0 && ! boilerplate;

	const disclosure = section( text, '## Use of AI Tools' );
	const hasDisclosure =
		disclosure !== null &&
		disclosure.trim().split( /\s+/ ).length >= 4 &&
		/\b(ai|claude|codex|gpt|llm|model)\b/i.test( disclosure );

	// The skill asks for under 400 words; allow a small tolerance for run-to-run
	// variance without letting real padding through.
	const wordCount = text.split( /\s+/ ).filter( Boolean ).length;
	const succinct = wordCount > 0 && wordCount <= 450;

	const components = [
		check(
			'Hit the skill',
			hitSkill,
			hitSkill
				? 'read the pull-requests skill'
				: 'never read the pull-requests skill'
		),
		check(
			'Read the template',
			readTemplate,
			readTemplate
				? 'read .github/PULL_REQUEST_TEMPLATE.md'
				: 'never read .github/PULL_REQUEST_TEMPLATE.md'
		),
		check(
			'Inspected the diff',
			inspectedDiff,
			inspectedDiff
				? 'inspected HEAD in the isolated fixture'
				: 'never inspected the fixture commit at HEAD'
		),
		check(
			'Template sections',
			hasSections,
			hasSections
				? 'What/Why/How/Testing Instructions present and in order'
				: 'missing or misordered What/Why/How/Testing Instructions sections'
		),
		check(
			'Keyboard testing',
			hasKeyboard,
			hasKeyboard
				? 'includes keyboard testing instructions'
				: 'UI change but no "Testing Instructions for Keyboard" section'
		),
		check(
			'Observable steps',
			observableSteps,
			observableSteps
				? 'includes a numbered step with a concrete observable result'
				: 'testing steps lack a numbered, concrete observable result'
		),
		check(
			'No setup boilerplate',
			noBoilerplate,
			noBoilerplate
				? 'starts at the first PR-specific action'
				: `contains setup boilerplate (${
						boilerplate ? boilerplate[ 0 ] : 'no testing section'
				  })`
		),
		check(
			'AI disclosure',
			hasDisclosure,
			hasDisclosure
				? 'discloses AI tooling'
				: 'missing or empty "Use of AI Tools" section'
		),
		check( 'Succinct', succinct, `${ wordCount } words (limit 450)` ),
	];

	const score =
		components.reduce( ( sum, item ) => sum + item.score, 0 ) /
		components.length;

	return {
		pass: score === 1,
		score,
		reason:
			components
				.filter( ( item ) => ! item.pass )
				.map( ( item ) => item.reason )
				.join( '; ' ) || 'all checks passed',
		componentResults: components,
	};
}

module.exports = ( output, context ) => gradePrDescription( output, context );
module.exports.gradePrDescription = gradePrDescription;
