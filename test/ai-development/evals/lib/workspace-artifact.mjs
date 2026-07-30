/**
 * Capture and parse the files changed in an evaluation workspace.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify( execFile );
const maxDiffLength = 60_000;

async function git( workspace, args ) {
	const { stdout } = await execFileAsync( 'git', args, {
		cwd: workspace,
		maxBuffer: 10 * 1024 * 1024,
	} );
	return stdout;
}

async function collectWorkspaceArtifact( workspace ) {
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

export function parseWorkspaceArtifact( output ) {
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

export function getAddedDiffLines( diff ) {
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
			artifact: await collectWorkspaceArtifact( workspace ),
		},
		null,
		2
	);
}
