/**
 * Fixture for the testing-skill routing eval.
 *
 * Unlike the pull-requests target, this one overlays nothing: the pinned commit
 * already carries `AGENTS.md`'s routing line, `CLAUDE.md`, and
 * `skills/testing/` with all three reference files, which is everything the
 * agent needs to find its way to the right one.
 */
import { buildFixtureRepository } from '../shared/fixture-repo.mjs';

/**
 * Any commit whose tree contains `skills/testing/` works; this one is shared
 * with the pull-requests eval so both fixtures build from the same history.
 */
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
