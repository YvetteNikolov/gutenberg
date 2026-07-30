/**
 * Promptfoo lifecycle extension that gives every evaluation row a fresh,
 * writable checkout of the current commit.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify( execFile );
const libDir = path.dirname( fileURLToPath( import.meta.url ) );
const sourceRoot = path.resolve( libDir, '../../../..' );
const activeWorkspaces = new Map();

const gitEnvironment = {
	...process.env,
	GIT_AUTHOR_NAME: 'Gutenberg Agent Eval',
	GIT_AUTHOR_EMAIL: 'gutenberg-agent-eval@example.com',
	GIT_COMMITTER_NAME: 'Gutenberg Agent Eval',
	GIT_COMMITTER_EMAIL: 'gutenberg-agent-eval@example.com',
};

async function git( cwd, args ) {
	return execFileAsync( 'git', args, {
		cwd,
		env: gitEnvironment,
		maxBuffer: 10 * 1024 * 1024,
	} );
}

async function createWorkspace() {
	const temporaryRoot = await fs.mkdtemp(
		path.join( os.tmpdir(), 'gutenberg-agent-eval-' )
	);
	const workspace = path.join( temporaryRoot, 'repository' );
	const archive = path.join( temporaryRoot, 'repository.tar' );

	try {
		await fs.mkdir( workspace );
		await git( sourceRoot, [
			'archive',
			'--format=tar',
			`--output=${ archive }`,
			'HEAD',
		] );
		await execFileAsync( 'tar', [ '-xf', archive, '-C', workspace ] );
		await fs.unlink( archive );

		// Do not expose the evaluation or its expected behavior to the subject.
		await fs.rm( path.join( workspace, 'test/ai-development/evals' ), {
			recursive: true,
			force: true,
		} );

		await git( workspace, [ 'init', '--quiet' ] );
		await git( workspace, [ 'add', '--all' ] );
		await git( workspace, [
			'commit',
			'--quiet',
			'--message',
			'Eval workspace',
		] );

		activeWorkspaces.set( workspace, temporaryRoot );
		return workspace;
	} catch ( error ) {
		await fs.rm( temporaryRoot, { recursive: true, force: true } );
		throw error;
	}
}

async function cleanupWorkspace( workspace ) {
	const temporaryRoot = activeWorkspaces.get( workspace );
	if ( ! temporaryRoot ) {
		return;
	}

	activeWorkspaces.delete( workspace );
	for ( let attempt = 1; attempt <= 5; attempt++ ) {
		try {
			await fs.rm( temporaryRoot, { recursive: true, force: true } );
			return;
		} catch ( error ) {
			if ( attempt === 5 ) {
				throw error;
			}
			// Docker Desktop can leave deny-delete ACLs on bind-mounted
			// directories after wp-env stops.
			if ( process.platform === 'darwin' ) {
				await execFileAsync( 'chmod', [ '-RN', temporaryRoot ] ).catch(
					() => undefined
				);
			}
			await new Promise( ( resolve ) =>
				setTimeout( resolve, attempt * 250 )
			);
		}
	}
}

export async function extensionHook( hookName, context ) {
	if ( hookName === 'beforeEach' ) {
		const workspace = await createWorkspace();
		const sandbox = context.test.options?.sandbox;
		const gradingProvider = context.test.options?.provider;

		return {
			test: {
				...context.test,
				vars: {
					...context.test.vars,
					__workspace: workspace,
				},
				options: {
					...context.test.options,
					working_dir: workspace,
					...( gradingProvider && typeof gradingProvider === 'object'
						? {
								provider: {
									...gradingProvider,
									config: {
										...gradingProvider.config,
										working_dir: workspace,
									},
								},
						  }
						: {} ),
					...( sandbox
						? {
								sandbox: {
									...sandbox,
									filesystem: {
										...( sandbox.filesystem || {} ),
										allowRead: [ workspace ],
										allowWrite: [ workspace ],
									},
								},
						  }
						: {} ),
				},
			},
		};
	}

	if ( hookName === 'afterEach' ) {
		await cleanupWorkspace( context.test.options?.working_dir );
		return context;
	}

	if ( hookName === 'afterAll' ) {
		await Promise.all(
			[ ...activeWorkspaces.keys() ].map( cleanupWorkspace )
		);
	}

	return context;
}
