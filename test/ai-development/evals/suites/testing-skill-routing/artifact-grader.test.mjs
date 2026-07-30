/**
 * Tests for this suite's artifact grader.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
	assertedUnencodedAmpersand,
	changedE2eSpec,
	changedOnlyE2eTests,
	enteredLiteralAmpersand,
	includeWorkspaceArtifact,
	usedAccessibleParagraphLocator,
} from './artifact-grader.mjs';

const execFileAsync = promisify( execFile );

function output( changedFiles, additions ) {
	return JSON.stringify( {
		response: 'Added the requested test.',
		artifact: {
			changedFiles,
			diff: additions
				.split( '\n' )
				.map( ( line ) => `+${ line }` )
				.join( '\n' ),
			truncated: false,
		},
	} );
}

test( 'passes a focused E2E ampersand test artifact', () => {
	const result = output(
		[ 'test/e2e/specs/editor/various/writing-flow.spec.js' ],
		[
			"const paragraph = editor.canvas.getByRole( 'document', {",
			"\tname: 'Block: Paragraph',",
			'} );',
			"await paragraph.fill( '&' );",
			"await expect( paragraph ).toHaveText( '&' );",
		].join( '\n' )
	);

	assert.equal( changedE2eSpec( result ).pass, true );
	assert.equal( changedOnlyE2eTests( result ).pass, true );
	assert.equal( usedAccessibleParagraphLocator( result ).pass, true );
	assert.equal( enteredLiteralAmpersand( result ).pass, true );
	assert.equal( assertedUnencodedAmpersand( result ).pass, true );
} );

test( 'rejects a response without the requested test artifact', () => {
	const result = output(
		[ 'packages/block-editor/index.js' ],
		'return true;'
	);

	assert.equal( changedE2eSpec( result ).pass, false );
	assert.equal( changedOnlyE2eTests( result ).pass, false );
	assert.equal( usedAccessibleParagraphLocator( result ).pass, false );
	assert.equal( enteredLiteralAmpersand( result ).pass, false );
	assert.equal( assertedUnencodedAmpersand( result ).pass, false );
} );

test( 'rejects a non-accessible paragraph locator', () => {
	const result = output(
		[ 'test/e2e/specs/editor/blocks/paragraph.spec.js' ],
		'const paragraph = editor.canvas.locator( \'[data-type="core/paragraph"]\' );'
	);

	assert.equal( usedAccessibleParagraphLocator( result ).pass, false );
} );

test( 'does not treat encoded content as a literal ampersand assertion', () => {
	const result = output(
		[ 'test/e2e/specs/editor/various/writing-flow.spec.js' ],
		"await expect( paragraph ).toHaveText( '&amp;' );"
	);

	assert.equal( assertedUnencodedAmpersand( result ).pass, false );
} );

test( 'recognizes a block attribute object assertion', () => {
	const result = output(
		[ 'test/e2e/specs/editor/blocks/paragraph.spec.js' ],
		[
			'expect( await editor.getBlocks() ).toMatchObject( [',
			"{ name: 'core/paragraph', attributes: { content: '&' } },",
			'] );',
		].join( '\n' )
	);

	assert.equal( assertedUnencodedAmpersand( result ).pass, true );
} );

test( 'captures an untracked file from the temporary workspace', async () => {
	const workspace = await fs.mkdtemp(
		path.join( os.tmpdir(), 'artifact-grader-test-' )
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
