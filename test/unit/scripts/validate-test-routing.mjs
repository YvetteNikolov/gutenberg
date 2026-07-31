/**
 * Node dependencies
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * External dependencies
 */
import globPackage from 'glob';

/**
 * Internal dependencies
 */
import {
	assertVitestProjectNames,
	discoverTestFiles,
	findOverlappingVitestProjectTests,
	getVitestTests,
	getVitestTestsByProject,
	isBrowserTestPath,
	VITEST_PROJECT_NAMES,
} from './discover-test-files.mjs';

const require = createRequire( import.meta.url );
const ROOT_DIR = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'../../..'
);
const JEST_CONFIG = 'test/unit/jest.config.js';
const VITEST_CONFIG = 'test/unit/vitest.config.mjs';
const VITEST_CONFIG_PROJECT_NAMES = {
	browser: 'browser',
	// Preserve the Flakiness.io identity used before project routing.
	jsdom: 'vitest',
	node: 'node',
};
const manifest = JSON.parse(
	readFileSync(
		path.join( ROOT_DIR, 'test/unit/test-migration.json' ),
		'utf8'
	)
);

function normalizeTestPath( testPath ) {
	return path
		.relative( ROOT_DIR, path.resolve( ROOT_DIR, testPath ) )
		.split( path.sep )
		.join( '/' );
}

function resolvePackageBin( packageName ) {
	const packageJsonPath = require.resolve( `${ packageName }/package.json` );
	const packageJson = JSON.parse( readFileSync( packageJsonPath, 'utf8' ) );
	const binPath =
		typeof packageJson.bin === 'string'
			? packageJson.bin
			: packageJson.bin[ packageName ];

	return path.resolve( path.dirname( packageJsonPath ), binPath );
}

function listTests( packageName, args ) {
	const result = spawnSync(
		process.execPath,
		[ resolvePackageBin( packageName ), ...args ],
		{
			cwd: ROOT_DIR,
			encoding: 'utf8',
			env: process.env,
			maxBuffer: 20 * 1024 * 1024,
		}
	);

	if ( result.status !== 0 ) {
		process.stderr.write( result.stdout );
		process.stderr.write( result.stderr );
		process.exit( result.status ?? 1 );
	}

	return new Set(
		result.stdout
			.trim()
			.split( /\r?\n/ )
			.filter( Boolean )
			.map( ( testPath ) => testPath.replace( /^\[[^\]]+\]\s+/, '' ) )
			.map( normalizeTestPath )
	);
}

function assertUniquePaths( label, testPaths ) {
	assert.equal(
		new Set( testPaths ).size,
		testPaths.length,
		`${ label } contains duplicate paths.`
	);

	for ( const testPath of testPaths ) {
		assert.equal(
			testPath,
			normalizeTestPath( testPath ),
			`${ label } contains a non-normalized path: ${ testPath }`
		);
	}
}

assertVitestProjectNames( 'vitest.projects', manifest.vitest.projects );

assert.deepEqual(
	[
		...manifest.vitest.projects.browser.files,
		...manifest.vitest.projects.browser.directories,
	],
	[],
	'Browser Mode ownership is derived from *.browser.test.* filenames, not manifest entries.'
);

const browserTestsAssignedToOtherProjects = [ 'jsdom', 'node' ].flatMap(
	( projectName ) =>
		manifest.vitest.projects[ projectName ].files
			.filter( isBrowserTestPath )
			.map( ( testPath ) => `${ projectName }: ${ testPath }` )
);
assert.deepEqual(
	browserTestsAssignedToOtherProjects,
	[],
	`Browser Mode filenames cannot be assigned to jsdom or Node:\n${ browserTestsAssignedToOtherProjects.join(
		'\n'
	) }`
);

for ( const projectName of VITEST_PROJECT_NAMES ) {
	assertUniquePaths(
		`vitest.projects.${ projectName }.files`,
		manifest.vitest.projects[ projectName ].files
	);
	assertUniquePaths(
		`vitest.projects.${ projectName }.directories`,
		manifest.vitest.projects[ projectName ].directories
	);
}

const expectedVitestTestsByProject = getVitestTestsByProject(
	ROOT_DIR,
	manifest
);
const overlappingProjectTests = findOverlappingVitestProjectTests(
	expectedVitestTestsByProject
);
assert.deepEqual(
	overlappingProjectTests,
	[],
	`Vitest tests are owned by multiple projects:\n${ overlappingProjectTests.join(
		'\n'
	) }`
);

const migratedTestFiles = Object.values( manifest.vitest.projects ).flatMap(
	( project ) => project.files
);
const migratedDirectories = Object.values( manifest.vitest.projects ).flatMap(
	( project ) => project.directories
);
const invalidMigratedEntries = [
	...migratedTestFiles.filter(
		( testPath ) => ! existsSync( path.join( ROOT_DIR, testPath ) )
	),
	...migratedDirectories.filter(
		( directoryPath ) =>
			! existsSync( path.join( ROOT_DIR, directoryPath ) )
	),
];
assert.deepEqual(
	invalidMigratedEntries,
	[],
	`Migrated files or directories do not exist:\n${ invalidMigratedEntries.join(
		'\n'
	) }`
);

const jestTests = listTests( 'jest', [
	'--config',
	JEST_CONFIG,
	'--listTests',
] );
const vitestTestsByProject = Object.fromEntries(
	VITEST_PROJECT_NAMES.map( ( projectName ) => [
		projectName,
		existsSync( path.join( ROOT_DIR, VITEST_CONFIG ) )
			? listTests( 'vitest', [
					'list',
					'--config',
					VITEST_CONFIG,
					'--project',
					VITEST_CONFIG_PROJECT_NAMES[ projectName ],
					'--filesOnly',
					'--passWithNoTests',
			  ] )
			: new Set(),
	] )
);
const vitestTests = new Set(
	Object.values( vitestTestsByProject ).flatMap( ( projectTests ) => [
		...projectTests,
	] )
);

for ( const projectName of VITEST_PROJECT_NAMES ) {
	assert.deepEqual(
		[ ...vitestTestsByProject[ projectName ] ].sort(),
		expectedVitestTestsByProject[ projectName ],
		`Vitest ${ projectName } discovery does not match the migration manifest.`
	);
}
assert.deepEqual(
	[ ...vitestTests ].sort(),
	getVitestTests( ROOT_DIR, manifest ),
	'Vitest discovery does not match the migration manifest.'
);

const overlappingTests = [ ...jestTests ].filter( ( testPath ) =>
	vitestTests.has( testPath )
);
assert.deepEqual(
	overlappingTests,
	[],
	`Tests are owned by both Jest and Vitest:\n${ overlappingTests.join(
		'\n'
	) }`
);

const staticInventory = discoverTestFiles( ROOT_DIR );
const runnerInventory = [
	...new Set( [ ...jestTests, ...vitestTests ] ),
].sort();
assert.deepEqual(
	runnerInventory,
	staticInventory,
	'Executable runner inventory does not match static test discovery.'
);

const { sync: glob } = globPackage;
const orphanedSnapshots = glob( '**/__snapshots__/*.snap', {
	cwd: ROOT_DIR,
	ignore: [ '**/node_modules/**', '**/vendor/**' ],
	nodir: true,
} ).filter( ( snapshotPath ) => {
	const testPath = path.join(
		path.dirname( path.dirname( snapshotPath ) ),
		path.basename( snapshotPath, '.snap' )
	);
	return ! existsSync( path.join( ROOT_DIR, testPath ) );
} );
assert.deepEqual(
	orphanedSnapshots,
	[],
	`Snapshots without a matching test file:\n${ orphanedSnapshots.join(
		'\n'
	) }`
);

console.log(
	`Validated exactly one runner and environment for ${
		staticInventory.length
	} tests: ${ jestTests.size } Jest and ${
		vitestTests.size
	} Vitest (${ VITEST_PROJECT_NAMES.map(
		( projectName ) =>
			`${ projectName }: ${ vitestTestsByProject[ projectName ].size }`
	).join( ', ' ) }).`
);
