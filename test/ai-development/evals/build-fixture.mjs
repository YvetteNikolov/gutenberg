/**
 * Builds a disposable git repository that recreates a historical commit, so an
 * agent can be asked to work on a real change without touching the developer's
 * checkout.
 *
 * This module is deliberately generic: it knows how to rebuild a commit and
 * nothing about any particular eval. Target-specific setup (guidance files,
 * seeded state, removed directories) belongs in the `overlay` callback supplied
 * by the eval target.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify( execFile );

const EVAL_AUTHOR = {
	GIT_AUTHOR_NAME: 'Gutenberg Agent Eval',
	GIT_AUTHOR_EMAIL: 'gutenberg-agent-eval@example.com',
	GIT_COMMITTER_NAME: 'Gutenberg Agent Eval',
	GIT_COMMITTER_EMAIL: 'gutenberg-agent-eval@example.com',
};

async function git( cwd, args, options = {} ) {
	return execFileAsync( 'git', args, {
		cwd,
		env: { ...process.env, ...EVAL_AUTHOR },
		maxBuffer: 10 * 1024 * 1024,
		...options,
	} );
}

/**
 * Builds a disposable repository with two commits:
 * 1. The target commit's parent, plus whatever `overlay` writes.
 * 2. The target production change.
 *
 * The eval's own configuration and golden answers are never copied in — the
 * fixture contains only what the subject agent is allowed to see.
 *
 * @param {Object}   options              Fixture options.
 * @param {string}   options.sourceRoot   Checkout containing the source commit.
 * @param {string}   options.targetCommit Historical commit to recreate.
 * @param {Function} [options.overlay]    `async (fixtureRoot) => void`, run against the
 *                                        baseline tree before the first commit.
 * @param {string}   [options.label]      Short description recorded in the baseline commit message.
 * @return {Promise<Object>} `{ cwd, fixtureCommit, cleanup }`.
 */
export async function buildFixtureRepository( {
	sourceRoot,
	targetCommit,
	overlay,
	label = 'baseline',
} ) {
	if ( ! sourceRoot ) {
		throw new Error( 'sourceRoot is required to build a fixture' );
	}
	if ( ! targetCommit ) {
		throw new Error( 'targetCommit is required to build a fixture' );
	}

	const temporaryRoot = await fs.mkdtemp(
		path.join( os.tmpdir(), 'gutenberg-agent-eval-' )
	);
	const fixtureRoot = path.join( temporaryRoot, 'repository' );
	const archivePath = path.join( temporaryRoot, 'fixture.tar' );
	const patchPath = path.join( temporaryRoot, 'change.patch' );

	try {
		await fs.mkdir( fixtureRoot );
		await git( sourceRoot, [
			'archive',
			'--format=tar',
			`--output=${ archivePath }`,
			`${ targetCommit }^`,
		] );
		await execFileAsync( 'tar', [ '-xf', archivePath, '-C', fixtureRoot ] );
		await fs.unlink( archivePath );

		if ( overlay ) {
			await overlay( fixtureRoot );
		}

		await git( fixtureRoot, [ 'init', '--quiet' ] );
		await git( fixtureRoot, [ 'add', '--all' ] );
		await git( fixtureRoot, [
			'commit',
			'--quiet',
			'--message',
			`Eval fixture (${ label })`,
		] );

		const { stdout: patch } = await git( sourceRoot, [
			'show',
			'--format=',
			'--binary',
			targetCommit,
		] );
		await fs.writeFile( patchPath, patch );
		await git( fixtureRoot, [ 'apply', patchPath ] );
		await git( fixtureRoot, [ 'add', '--all' ] );

		const { stdout: subject } = await git( sourceRoot, [
			'show',
			'--quiet',
			'--format=%s',
			targetCommit,
		] );
		await git( fixtureRoot, [
			'commit',
			'--quiet',
			'--message',
			subject.trim(),
		] );

		const { stdout: fixtureCommit } = await git( fixtureRoot, [
			'rev-parse',
			'HEAD',
		] );

		return {
			cwd: fixtureRoot,
			fixtureCommit: fixtureCommit.trim(),
			cleanup: () =>
				fs.rm( temporaryRoot, { recursive: true, force: true } ),
		};
	} catch ( error ) {
		await fs.rm( temporaryRoot, { recursive: true, force: true } );
		throw error;
	}
}
