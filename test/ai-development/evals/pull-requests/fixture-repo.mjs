/**
 * Fixture for the pull-requests skill eval.
 *
 * Composes the generic repository builder with the guidance overlay this eval
 * varies: the candidate fixture carries `skills/pull-requests/SKILL.md` and the
 * AGENTS.md line that routes to it; the control fixture carries neither, while
 * keeping the PR template and every other repository instruction identical.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { buildFixtureRepository } from '../shared/fixture-repo.mjs';

/**
 * The historical commit this eval recreates: "Notes: sync the sidebar selection
 * to the caret marker". Single source of truth for the promptfoo configs and
 * the fixture tests; override per provider with `fixture_commit` when adding a
 * second case.
 */
export const TARGET_COMMIT = '1f27df2962c8f459582eeb41435251713f30c810';

export const GUIDANCE_VARIANTS = [ 'candidate', 'control' ];

/**
 * The AGENTS.md fragment that routes an agent to the skill. Removing it is what
 * makes the control arm a control, so a silent no-op here would collapse the
 * candidate-control delta — `assertRoutingRemoved` guards against that.
 */
const SKILL_ROUTING =
	'; `skills/pull-requests/SKILL.md` for authoring a PR description';

async function applyGuidance( sourceRoot, fixtureRoot, guidance ) {
	const currentAgents = await fs.readFile(
		path.join( sourceRoot, 'AGENTS.md' ),
		'utf8'
	);

	if ( guidance === 'control' && ! currentAgents.includes( SKILL_ROUTING ) ) {
		throw new Error(
			'Cannot build the control fixture: the skill routing fragment was not ' +
				`found in AGENTS.md. Update SKILL_ROUTING in ${
					import.meta.url
				}.`
		);
	}

	const agents =
		guidance === 'candidate'
			? currentAgents
			: currentAgents.replace( SKILL_ROUTING, '' );

	await fs.writeFile( path.join( fixtureRoot, 'AGENTS.md' ), agents );
	await fs.copyFile(
		path.join( sourceRoot, 'CLAUDE.md' ),
		path.join( fixtureRoot, 'CLAUDE.md' )
	);
	await fs.copyFile(
		path.join( sourceRoot, '.github', 'PULL_REQUEST_TEMPLATE.md' ),
		path.join( fixtureRoot, '.github', 'PULL_REQUEST_TEMPLATE.md' )
	);

	const skillDirectory = path.join( fixtureRoot, 'skills', 'pull-requests' );

	if ( guidance === 'candidate' ) {
		await fs.mkdir( skillDirectory, { recursive: true } );
		await fs.copyFile(
			path.join( sourceRoot, 'skills', 'pull-requests', 'SKILL.md' ),
			path.join( skillDirectory, 'SKILL.md' )
		);
	} else {
		await fs.rm( skillDirectory, { recursive: true, force: true } );
	}
}

/**
 * @param {Object}                options                Fixture options.
 * @param {string}                options.sourceRoot     Gutenberg checkout containing the source commit.
 * @param {string}                [options.targetCommit] Commit to recreate. Defaults to `TARGET_COMMIT`.
 * @param {'candidate'|'control'} [options.guidance]     Guidance variant to overlay.
 * @return {Promise<Object>} Disposable fixture details and cleanup callback.
 */
export async function createFixtureRepository( {
	sourceRoot,
	targetCommit = TARGET_COMMIT,
	guidance = 'candidate',
} ) {
	if ( ! GUIDANCE_VARIANTS.includes( guidance ) ) {
		throw new Error( `Unknown guidance variant: ${ guidance }` );
	}

	const fixture = await buildFixtureRepository( {
		sourceRoot,
		targetCommit,
		label: `${ guidance } guidance`,
		overlay: ( fixtureRoot ) =>
			applyGuidance( sourceRoot, fixtureRoot, guidance ),
	} );

	return { ...fixture, guidance };
}
