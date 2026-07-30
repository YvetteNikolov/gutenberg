/**
 * Artifact capture and grading for this suite.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify( execFile );
const maxDiffLength = 60_000;
const e2eSpecPattern = /^test\/e2e\/specs\/.+\.spec\.(?:js|ts)$/;

async function git( workspace, args ) {
	const { stdout } = await execFileAsync( 'git', args, {
		cwd: workspace,
		maxBuffer: 10 * 1024 * 1024,
	} );
	return stdout;
}

async function collectArtifact( workspace ) {
	// Intent-to-add makes untracked files visible to `git diff` without
	// staging their contents in the disposable workspace.
	await git( workspace, [ 'add', '--intent-to-add', '--all' ] );
	const names = await git( workspace, [
		'diff',
		'--name-only',
		'-z',
		'HEAD',
		'--',
	] );
	const changedFiles = names.split( '\0' ).filter( Boolean ).sort();
	let diff = await git( workspace, [
		'diff',
		'--no-ext-diff',
		'--unified=20',
		'HEAD',
		'--',
	] );

	const truncated = diff.length > maxDiffLength;
	if ( truncated ) {
		diff = `${ diff.slice( 0, maxDiffLength ) }\n[diff truncated]`;
	}

	return { changedFiles, diff, truncated };
}

function parseArtifact( output ) {
	const result = typeof output === 'string' ? JSON.parse( output ) : output;
	if (
		! result?.artifact ||
		! Array.isArray( result.artifact.changedFiles )
	) {
		throw new Error(
			'The transformed output does not contain a workspace artifact.'
		);
	}
	return result.artifact;
}

function grade( pass, reason ) {
	return { pass, score: pass ? 1 : 0, reason };
}

function addedLines( diff ) {
	return diff
		.split( '\n' )
		.filter(
			( line ) => line.startsWith( '+' ) && ! line.startsWith( '+++' )
		)
		.map( ( line ) => line.slice( 1 ) )
		.join( '\n' );
}

export async function includeWorkspaceArtifact( output, context ) {
	const workspace = context.vars.__workspace;
	if ( typeof workspace !== 'string' ) {
		throw new Error( 'The evaluation workspace was not provided.' );
	}

	return JSON.stringify(
		{
			response: output,
			artifact: await collectArtifact( workspace ),
		},
		null,
		2
	);
}

export function changedE2eSpec( output ) {
	const { changedFiles } = parseArtifact( output );
	const specs = changedFiles.filter( ( file ) =>
		e2eSpecPattern.test( file )
	);
	return grade(
		specs.length > 0,
		specs.length > 0
			? `Changed E2E spec: ${ specs.join( ', ' ) }`
			: 'No E2E spec was changed.'
	);
}

export function changedOnlyE2eTests( output ) {
	const { changedFiles } = parseArtifact( output );
	const unrelated = changedFiles.filter(
		( file ) => ! file.startsWith( 'test/e2e/' )
	);
	return grade(
		changedFiles.length > 0 && unrelated.length === 0,
		unrelated.length === 0
			? 'All changed files are under test/e2e/.'
			: `Changed files outside test/e2e/: ${ unrelated.join( ', ' ) }`
	);
}

export function usedAccessibleParagraphLocator( output ) {
	const additions = addedLines( parseArtifact( output ).diff );
	const hasLocator =
		/editor\s*\.\s*canvas\s*\.\s*getByRole\s*\(\s*(['"])document\1\s*,\s*\{[\s\S]{0,300}?name\s*:\s*(['"])Block:\s*Paragraph\2[\s\S]{0,100}?\}\s*\)/.test(
			additions
		);
	return grade(
		hasLocator,
		hasLocator
			? 'The test finds the paragraph with the documented accessible canvas locator.'
			: "No added locator uses editor.canvas.getByRole( 'document', { name: 'Block: Paragraph' } )."
	);
}

export function enteredLiteralAmpersand( output ) {
	const additions = addedLines( parseArtifact( output ).diff );
	const hasInput =
		/(?:fill|type|pressSequentially|insertText)\s*\(\s*(['"`])&\1/.test(
			additions
		);
	return grade(
		hasInput,
		hasInput
			? 'The test enters a literal ampersand through an input API.'
			: 'No added input action enters a literal ampersand.'
	);
}

export function assertedUnencodedAmpersand( output ) {
	const additions = addedLines( parseArtifact( output ).diff );
	const assertsRawAmpersand =
		/(?:toBe|toEqual|toContain|toHaveText|toMatch|toMatchObject)\s*\([\s\S]{0,800}?(['"`])&(?!amp;)\1/.test(
			additions
		);
	const rejectsEncodedAmpersand =
		/\.not\s*\.\s*(?:toBe|toEqual|toContain|toHaveText|toMatch|toMatchObject)\s*\([\s\S]{0,800}?(['"`])&amp;\1/.test(
			additions
		);

	return grade(
		assertsRawAmpersand || rejectsEncodedAmpersand,
		assertsRawAmpersand || rejectsEncodedAmpersand
			? 'The test distinguishes a literal ampersand from encoded content.'
			: 'No added assertion checks the literal or encoded ampersand result.'
	);
}
