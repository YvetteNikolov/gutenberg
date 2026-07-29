/**
 * Prints the candidate-control delta for each named metric.
 *
 * This is the only analysis promptfoo does not already do — use `npm run view`
 * for per-run detail, transcripts and the results table. Arms are paired on
 * provider metadata (`evaluation`, `agentProvider`, `guidance`), never on
 * display labels, so renaming a provider cannot silently mis-bucket a run.
 */
/* eslint-disable no-console */
import fs from 'node:fs/promises';

const files = process.argv.slice( 2 );

if ( files.length === 0 ) {
	throw new Error(
		'Usage: node shared/summarize-results.mjs <results.json> [...]'
	);
}

const arms = new Map();
let skipped = 0;

for ( const file of files ) {
	const data = JSON.parse( await fs.readFile( file, 'utf8' ) );

	for ( const result of data.results?.results || [] ) {
		const { evaluation, agentProvider, guidance } =
			result.response?.metadata || {};

		if ( ! evaluation || ! guidance ) {
			skipped += 1;
			continue;
		}

		const key = `${ evaluation }|${
			agentProvider || 'unknown'
		}|${ guidance }`;
		const arm = arms.get( key ) || { runs: 0, metrics: {} };

		arm.runs += 1;
		for ( const component of result.gradingResult?.componentResults ||
			[] ) {
			const metric = component.assertion?.metric;
			if ( metric ) {
				arm.metrics[ metric ] =
					( arm.metrics[ metric ] || 0 ) +
					Number( component.score || 0 );
			}
		}
		arms.set( key, arm );
	}
}

const mean = ( arm, metric ) => ( arm.metrics[ metric ] || 0 ) / arm.runs;

const pairs = new Set(
	[ ...arms.keys() ].map( ( key ) =>
		key.split( '|' ).slice( 0, 2 ).join( '|' )
	)
);

for ( const pair of pairs ) {
	const candidate = arms.get( `${ pair }|candidate` );
	const control = arms.get( `${ pair }|control` );

	if ( ! candidate || ! control ) {
		console.log( `${ pair.replace( '|', ' / ' ) }: needs both arms` );
		continue;
	}

	const metrics = [
		...new Set( [
			...Object.keys( candidate.metrics ),
			...Object.keys( control.metrics ),
		] ),
	].sort();

	console.log( `\n${ pair.replace( '|', ' / ' ) }` );
	console.table(
		metrics.map( ( metric ) => ( {
			metric,
			candidate: mean( candidate, metric ).toFixed( 2 ),
			control: mean( control, metric ).toFixed( 2 ),
			delta: (
				mean( candidate, metric ) - mean( control, metric )
			).toFixed( 2 ),
		} ) )
	);
}

if ( skipped > 0 ) {
	console.log( `\nSkipped ${ skipped } run(s) missing provider metadata.` );
}
/* eslint-enable no-console */
