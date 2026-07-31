/**
 * Node dependencies
 */
import path from 'node:path';

/**
 * External dependencies
 */
import globPackage from 'glob';

const { sync: glob } = globPackage;

export const TEST_PATTERNS = [
	'**/__tests__/**/*.[jt]s?(x)',
	'**/test/*.[jt]s?(x)',
	'**/?(*.)test.[jt]s?(x)',
];

export const TEST_IGNORES = [
	'**/.git/**',
	'**/node_modules/**',
	'packages/e2e-tests/**',
	'packages/e2e-test-utils-playwright/src/test.ts',
	'**/build/**',
	'**/build-module/**',
	'**/build-types/**',
	'**/*.d.ts',
	'vendor/**',
];

export const VITEST_PROJECT_NAMES = [ 'browser', 'jsdom', 'node' ];

const BROWSER_TEST_PATH_PATTERN = /\.browser\.(?:test|spec)\.[jt]sx?$/;

function normalizeTestPath( testPath ) {
	return testPath.split( path.sep ).join( '/' );
}

export function isBrowserTestPath( testPath ) {
	return BROWSER_TEST_PATH_PATTERN.test( normalizeTestPath( testPath ) );
}

export function assertVitestProjectNames( label, projects ) {
	const actualProjectNames = Object.keys( projects ).sort();
	const expectedProjectNames = [ ...VITEST_PROJECT_NAMES ].sort();

	if (
		actualProjectNames.length !== expectedProjectNames.length ||
		actualProjectNames.some(
			( projectName, index ) =>
				projectName !== expectedProjectNames[ index ]
		)
	) {
		throw new Error(
			`${ label } must define exactly these projects: ${ VITEST_PROJECT_NAMES.join(
				', '
			) }.`
		);
	}
}

export function findOverlappingVitestProjectTests( testsByProject ) {
	const projectOwners = new Map();

	for ( const [ projectName, projectTests ] of Object.entries(
		testsByProject
	) ) {
		for ( const testPath of projectTests ) {
			const owners = projectOwners.get( testPath ) ?? [];
			owners.push( projectName );
			projectOwners.set( testPath, owners );
		}
	}

	return [ ...projectOwners ]
		.filter( ( [ , owners ] ) => owners.length > 1 )
		.map(
			( [ testPath, owners ] ) =>
				`${ testPath }: ${ owners.join( ', ' ) }`
		);
}

export function discoverTestFiles( rootDir ) {
	return [
		...new Set(
			TEST_PATTERNS.flatMap( ( pattern ) =>
				glob( pattern, {
					absolute: false,
					cwd: rootDir,
					ignore: TEST_IGNORES,
					nodir: true,
				} )
			).map( normalizeTestPath )
		),
	].sort();
}

export function getVitestTestsForProject( rootDir, manifest, projectName ) {
	const discoveredTests = discoverTestFiles( rootDir );

	if ( projectName === 'browser' ) {
		return discoveredTests.filter( isBrowserTestPath );
	}

	const project = manifest.vitest.projects[ projectName ];
	const directoryTests = discoveredTests.filter(
		( testPath ) =>
			! isBrowserTestPath( testPath ) &&
			project.directories.some(
				( directoryPath ) =>
					testPath === directoryPath ||
					testPath.startsWith( `${ directoryPath }/` )
			)
	);

	return [
		...new Set( [
			...project.files.filter(
				( testPath ) => ! isBrowserTestPath( testPath )
			),
			...directoryTests,
		] ),
	].sort();
}

export function getVitestTestsByProject( rootDir, manifest ) {
	assertVitestProjectNames( 'vitest.projects', manifest.vitest.projects );

	return Object.fromEntries(
		VITEST_PROJECT_NAMES.map( ( projectName ) => [
			projectName,
			getVitestTestsForProject( rootDir, manifest, projectName ),
		] )
	);
}

export function getVitestTests( rootDir, manifest ) {
	return [
		...new Set(
			Object.values( getVitestTestsByProject( rootDir, manifest ) ).flat()
		),
	].sort();
}
