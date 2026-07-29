import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify( execFile );

/**
 * The historical commit this eval recreates: "Notes: sync the sidebar selection
 * to the caret marker". Single source of truth for the promptfoo configs and
 * the fixture tests; override per provider with `fixture_commit` when adding a
 * second case.
 */
export const TARGET_COMMIT = '1f27df2962c8f459582eeb41435251713f30c810';

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

async function copyGuidance( sourceRoot, fixtureRoot, guidance ) {
	const currentAgents = await fs.readFile(
		path.join( sourceRoot, 'AGENTS.md' ),
		'utf8'
	);
	const agents =
		guidance === 'candidate'
			? currentAgents
			: currentAgents.replace(
					/; `skills\/pull-requests\/SKILL\.md` for authoring a PR description/,
					''
			  );

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
 * Builds a disposable repository with two commits:
 * 1. The target commit's parent plus the guidance variant under test.
 * 2. The target production change.
 *
 * Eval definitions and golden fixtures are never copied into this repository.
 *
 * @param {Object}                options                Fixture options.
 * @param {string}                options.sourceRoot     Gutenberg checkout containing the source commit.
 * @param {string}                [options.targetCommit] Historical commit to recreate. Defaults to `TARGET_COMMIT`.
 * @param {'candidate'|'control'} [options.guidance]     Guidance variant to overlay.
 * @return {Promise<Object>} Disposable fixture details and cleanup callback.
 */
export async function createFixtureRepository( {
	sourceRoot,
	targetCommit = TARGET_COMMIT,
	guidance = 'candidate',
} ) {
	if ( ! targetCommit ) {
		throw new Error( 'fixture_commit must be a commit-ish when provided' );
	}
	if ( ! [ 'candidate', 'control' ].includes( guidance ) ) {
		throw new Error( `Unknown guidance variant: ${ guidance }` );
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

		await copyGuidance( sourceRoot, fixtureRoot, guidance );

		await git( fixtureRoot, [ 'init', '--quiet' ] );
		await git( fixtureRoot, [ 'add', '--all' ] );
		await git( fixtureRoot, [
			'commit',
			'--quiet',
			'--message',
			`Eval fixture with ${ guidance } guidance`,
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
			guidance,
			cleanup: () =>
				fs.rm( temporaryRoot, { recursive: true, force: true } ),
		};
	} catch ( error ) {
		await fs.rm( temporaryRoot, { recursive: true, force: true } );
		throw error;
	}
}
