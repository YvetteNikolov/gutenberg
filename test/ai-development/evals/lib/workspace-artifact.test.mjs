/**
 * Tests for workspace artifact capture.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { includeWorkspaceArtifact } from './workspace-artifact.mjs';

const execFileAsync = promisify( execFile );

test( 'captures an untracked file from the temporary workspace', async () => {
	const workspace = await fs.mkdtemp(
		path.join( os.tmpdir(), 'workspace-artifact-test-' )
	);
	const spec = 'test/e2e/specs/editor/example.spec.js';

	try {
		await execFileAsync( 'git', [ 'init', '--quiet' ], { cwd: workspace } );
		await execFileAsync(
			'git',
			[
				'-c',
				'user.name=Test',
				'-c',
				'user.email=test@example.com',
				'commit',
				'--allow-empty',
				'--quiet',
				'--message=Initial',
			],
			{ cwd: workspace }
		);
		await fs.mkdir( path.join( workspace, path.dirname( spec ) ), {
			recursive: true,
		} );
		await fs.writeFile(
			path.join( workspace, spec ),
			"await paragraph.fill( '&' );\n"
		);

		const transformed = await includeWorkspaceArtifact( 'Done.', {
			vars: { __workspace: workspace },
		} );
		const result = JSON.parse( transformed );

		assert.deepEqual( result.artifact.changedFiles, [ spec ] );
		assert.match( result.artifact.diff, /paragraph\.fill/ );
	} finally {
		await fs.rm( workspace, { recursive: true, force: true } );
	}
} );
