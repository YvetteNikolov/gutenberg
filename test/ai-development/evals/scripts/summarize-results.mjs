import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify( execFile );
const resultFiles = process.argv
	.slice( 2 )
	.filter( ( argument ) => argument !== '--record' );
const files =
	resultFiles.length > 0
		? resultFiles
		: [
				'results/raw/pr-skill-claude.json',
				'results/raw/pr-skill-codex.json',
		  ];

const runs = [];
for ( const file of files ) {
	const data = JSON.parse( await fs.readFile( file, 'utf8' ) );
	for ( const result of data.results?.results || [] ) {
		const metadata = result.response?.metadata || {};
		const label =
			result.provider?.label || result.provider?.id || 'unknown provider';
		const guidance =
			metadata.guidance ||
			( /control|baseline|no repo guidance/i.test( label )
				? 'control'
				: 'candidate' );
		const gradingComponents = result.gradingResult?.componentResults || [];
		const compliance = gradingComponents.find( ( component ) =>
			Array.isArray( component.componentResults )
		);
		const usefulness = gradingComponents.find(
			( component ) =>
				component.assertion?.metric === 'Reviewer usefulness'
		);
		runs.push( {
			file,
			label,
			guidance,
			model: metadata.model || 'unknown',
			pass: Boolean( result.success ),
			score: Number( result.score || 0 ),
			complianceScore: Number( compliance?.score || 0 ),
			usefulnessScore: Number( usefulness?.score || 0 ),
		} );
	}
}

const groups = Object.values(
	runs.reduce( ( accumulated, run ) => {
		const key = `${ run.label }|${ run.guidance }|${ run.model }`;
		accumulated[ key ] ||= {
			label: run.label,
			guidance: run.guidance,
			model: run.model,
			runs: 0,
			passes: 0,
			totalScore: 0,
			totalComplianceScore: 0,
			totalUsefulnessScore: 0,
		};
		accumulated[ key ].runs += 1;
		accumulated[ key ].passes += run.pass ? 1 : 0;
		accumulated[ key ].totalScore += run.score;
		accumulated[ key ].totalComplianceScore += run.complianceScore;
		accumulated[ key ].totalUsefulnessScore += run.usefulnessScore;
		return accumulated;
	}, {} )
).map( ( group ) => ( {
	label: group.label,
	guidance: group.guidance,
	model: group.model,
	runs: group.runs,
	passRate: group.passes / group.runs,
	meanScore: group.totalScore / group.runs,
	meanComplianceScore: group.totalComplianceScore / group.runs,
	meanUsefulnessScore: group.totalUsefulnessScore / group.runs,
} ) );

console.table(
	groups.map( ( group ) => ( {
		provider: group.label,
		guidance: group.guidance,
		model: group.model,
		runs: group.runs,
		'pass rate': group.passRate.toFixed( 2 ),
		'mean score': group.meanScore.toFixed( 3 ),
		compliance: group.meanComplianceScore.toFixed( 3 ),
		usefulness: group.meanUsefulnessScore.toFixed( 3 ),
	} ) )
);

for ( const agent of [ 'Claude', 'Codex' ] ) {
	const candidate = groups.find(
		( group ) =>
			group.label.includes( agent ) && group.guidance === 'candidate'
	);
	const control = groups.find(
		( group ) =>
			group.label.includes( agent ) && group.guidance === 'control'
	);
	if ( candidate && control ) {
		console.log(
			`${ agent } candidate-control deltas: total ${ (
				candidate.meanScore - control.meanScore
			).toFixed( 3 ) }, compliance ${ (
				candidate.meanComplianceScore - control.meanComplianceScore
			).toFixed( 3 ) }, usefulness ${ (
				candidate.meanUsefulnessScore - control.meanUsefulnessScore
			).toFixed( 3 ) }`
		);
	}
}

if ( process.argv.includes( '--record' ) ) {
	const { stdout: commit } = await execFileAsync( 'git', [
		'rev-parse',
		'HEAD',
	] );
	const historyPath = path.join( 'results', 'history.jsonl' );
	await fs.mkdir( path.dirname( historyPath ), { recursive: true } );
	await fs.appendFile(
		historyPath,
		`${ JSON.stringify( {
			recordedAt: new Date().toISOString(),
			commit: commit.trim(),
			groups,
		} ) }\n`
	);
	console.log( `Recorded summary in ${ historyPath }` );
}
