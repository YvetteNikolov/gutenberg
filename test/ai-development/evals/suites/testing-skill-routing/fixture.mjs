/**
 * Fixture for the testing-skill routing eval.
 *
 * This target overlays nothing: the pinned commit already carries `AGENTS.md`'s
 * routing line, `CLAUDE.md`, and `skills/testing/` with all three reference
 * files, which is everything the agent needs to find its way to the right one.
 * A target that varies guidance would pass an `overlay` callback instead.
 */
import { buildFixtureRepository } from '../../lib/build-fixture.mjs';

/** Any commit whose tree contains `skills/testing/` works. */
export const TARGET_COMMIT = '1f27df2962c8f459582eeb41435251713f30c810';

/**
 * @param {Object} options                Fixture options.
 * @param {string} options.sourceRoot     Gutenberg checkout containing the commit.
 * @param {string} [options.targetCommit] Commit to recreate. Defaults to `TARGET_COMMIT`.
 * @return {Promise<Object>} Disposable fixture details and cleanup callback.
 */
export async function createFixtureRepository( {
	sourceRoot,
	targetCommit = TARGET_COMMIT,
} ) {
	return buildFixtureRepository( {
		sourceRoot,
		targetCommit,
		label: 'testing skill routing',
	} );
}
