/**
 * Node dependencies
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * External dependencies
 */
import globPackage from 'glob';
import { parser } from 'typescript-eslint';

/**
 * Internal dependencies
 */
import {
	getVitestTests,
	getVitestTestsByProject,
	VITEST_PROJECT_NAMES,
} from './test-projects.mjs';
import {
	hasBrowserModeImport,
	hasTestEnvironmentOverride,
} from './vitest-conventions.mjs';

const { sync: glob } = globPackage;
const require = createRequire( import.meta.url );
const ROOT_DIR = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'../../..'
);
const vitestTestsByProject = getVitestTestsByProject( ROOT_DIR );
const vitestTests = getVitestTests( ROOT_DIR );
const browserTests = new Set( vitestTestsByProject.browser );
const vitestInfrastructure = [
	'test/unit/vitest.config.mjs',
	...glob( 'test/unit/config/**/*.vitest.{js,jsx,mjs,ts,tsx}', {
		cwd: ROOT_DIR,
		nodir: true,
	} ),
	...glob( 'test/unit/scripts/*.mjs', {
		cwd: ROOT_DIR,
		nodir: true,
	} ),
];
const files = [
	...new Set( [ ...vitestTests, ...vitestInfrastructure ] ),
].sort();
const vitestApiNames = new Set( [
	'afterAll',
	'afterEach',
	'assert',
	'beforeAll',
	'beforeEach',
	'describe',
	'expect',
	'it',
	'onTestFailed',
	'onTestFinished',
	'suite',
	'test',
	'vi',
] );
const violations = [];

function resolvePackageBin( packageName ) {
	const packageJsonPath = require.resolve( `${ packageName }/package.json` );
	const packageJson = JSON.parse( readFileSync( packageJsonPath, 'utf8' ) );
	const binPath =
		typeof packageJson.bin === 'string'
			? packageJson.bin
			: Object.values( packageJson.bin )[ 0 ];

	return path.resolve( path.dirname( packageJsonPath ), binPath );
}

function isCommonJsExport( node ) {
	if ( node?.type !== 'MemberExpression' ) {
		return false;
	}

	if (
		node.object?.type === 'Identifier' &&
		node.object.name === 'exports'
	) {
		return true;
	}

	return (
		node.object?.type === 'Identifier' &&
		node.object.name === 'module' &&
		node.property?.type === 'Identifier' &&
		node.property.name === 'exports'
	);
}

function isDynamicImport( node ) {
	return (
		node?.type === 'ImportExpression' ||
		( node?.type === 'CallExpression' && node.callee?.type === 'Import' )
	);
}

function visitAst( node, visitorKeys, visitors ) {
	visitors[ node.type ]?.( node );

	for ( const key of visitorKeys[ node.type ] ?? [] ) {
		const child = node[ key ];
		if ( Array.isArray( child ) ) {
			for ( const item of child ) {
				if ( item ) {
					visitAst( item, visitorKeys, visitors );
				}
			}
		} else if ( child ) {
			visitAst( child, visitorKeys, visitors );
		}
	}
}

function findWorkspacePackage( file ) {
	let directory = path.dirname( path.join( ROOT_DIR, file ) );

	while ( directory.startsWith( ROOT_DIR ) ) {
		const packagePath = path.join( directory, 'package.json' );
		if ( existsSync( packagePath ) ) {
			return packagePath;
		}
		if ( directory === ROOT_DIR ) {
			break;
		}
		directory = path.dirname( directory );
	}

	return null;
}

for ( const file of files ) {
	const filename = path.join( ROOT_DIR, file );
	const source = readFileSync( filename, 'utf8' );
	const { ast, scopeManager, visitorKeys } = parser.parseForESLint( source, {
		ecmaVersion: 'latest',
		filePath: filename,
		loc: true,
		range: true,
		sourceType: 'module',
	} );
	const unboundIdentifiers = new Set(
		scopeManager.globalScope.through.map(
			( reference ) => reference.identifier
		)
	);

	visitAst( ast, visitorKeys, {
		AssignmentExpression( node ) {
			if ( isCommonJsExport( node.left ) ) {
				violations.push(
					`${ file }:${ node.loc.start.line } CommonJS export`
				);
			}
		},
		CallExpression( node ) {
			if (
				node.callee?.type === 'Identifier' &&
				node.callee.name === 'require' &&
				unboundIdentifiers.has( node.callee )
			) {
				violations.push(
					`${ file }:${ node.loc.start.line } unbound require()`
				);
			}

			if (
				/\.tsx?$/.test( file ) &&
				node.callee?.type === 'MemberExpression' &&
				node.callee.object?.type === 'Identifier' &&
				node.callee.object.name === 'vi' &&
				node.callee.property?.type === 'Identifier' &&
				node.callee.property.name === 'mock' &&
				! isDynamicImport( node.arguments[ 0 ] )
			) {
				violations.push(
					`${ file }:${ node.loc.start.line } TypeScript vi.mock() must use vi.mock(import(...))`
				);
			}
		},
		Identifier( node ) {
			const { name } = node;
			if (
				vitestTests.includes( file ) &&
				vitestApiNames.has( name ) &&
				unboundIdentifiers.has( node )
			) {
				violations.push(
					`${ file }:${ node.loc.start.line } unbound Vitest API: ${ name }`
				);
			}
		},
	} );

	if (
		vitestTests.includes( file ) &&
		/(?:from\s+|import\s*)[('"]vitest\/globals/.test( source )
	) {
		violations.push( `${ file }: vitest/globals is not allowed` );
	}

	if (
		vitestTests.includes( file ) &&
		hasTestEnvironmentOverride( source )
	) {
		violations.push(
			`${ file }: per-file test environment overrides are not allowed`
		);
	}

	if (
		vitestTests.includes( file ) &&
		hasBrowserModeImport( source ) &&
		! browserTests.has( file )
	) {
		violations.push(
			`${ file }: Browser Mode imports require a *.browser.test.* filename`
		);
	}
}

const vitestVersions = new Map();
for ( const file of vitestTests ) {
	const source = readFileSync( path.join( ROOT_DIR, file ), 'utf8' );
	if ( ! /(?:from\s+|import\s*)[('"]vitest[)'"]/.test( source ) ) {
		violations.push( `${ file }: no explicit import from vitest` );
		continue;
	}

	const packagePath = findWorkspacePackage( file );
	if ( ! packagePath ) {
		violations.push( `${ file }: no owning package.json` );
		continue;
	}

	const packageJson = JSON.parse( readFileSync( packagePath, 'utf8' ) );
	const version =
		packageJson.devDependencies?.vitest || packageJson.dependencies?.vitest;
	const relativePackagePath = path.relative( ROOT_DIR, packagePath );
	if ( ! version ) {
		violations.push(
			`${ file }: ${ relativePackagePath } must declare Vitest as a direct dependency`
		);
		continue;
	}

	vitestVersions.set( relativePackagePath, version );
}

const distinctVersions = new Set( vitestVersions.values() );
if ( distinctVersions.size > 1 ) {
	violations.push(
		`Vitest dependency versions must match:\n${ [
			...vitestVersions.entries(),
		]
			.map(
				( [ packagePath, version ] ) => `${ packagePath }: ${ version }`
			)
			.join( '\n' ) }`
	);
}

if ( violations.length ) {
	throw new Error(
		`Vitest convention violations:\n${ violations.join( '\n' ) }`
	);
}

const typescriptTestsByProject = Object.fromEntries(
	VITEST_PROJECT_NAMES.map( ( projectName ) => [
		projectName,
		vitestTestsByProject[ projectName ].filter( ( file ) =>
			/\.tsx?$/.test( file )
		),
	] )
);
const typescriptTests = Object.values( typescriptTestsByProject ).flat();
const commonTypes = [
	'gutenberg-env',
	'react-css-custom-properties',
	'style-imports',
];

function getTypecheckConfigPath( testFile ) {
	let directory = path.dirname( path.join( ROOT_DIR, testFile ) );

	while ( directory.startsWith( ROOT_DIR ) && directory !== ROOT_DIR ) {
		for ( const configName of [ 'tsconfig.test.json', 'tsconfig.json' ] ) {
			const configPath = path.join( directory, configName );
			if ( existsSync( configPath ) ) {
				return configPath;
			}
		}
		directory = path.dirname( directory );
	}

	return path.join( ROOT_DIR, 'tsconfig.base.json' );
}

for ( const projectName of VITEST_PROJECT_NAMES ) {
	const projectTypescriptTests = typescriptTestsByProject[ projectName ];
	if ( ! projectTypescriptTests.length ) {
		continue;
	}

	const testsByConfig = new Map();
	for ( const testFile of projectTypescriptTests ) {
		const configPath = getTypecheckConfigPath( testFile );
		const configTests = testsByConfig.get( configPath ) ?? [];
		configTests.push( testFile );
		testsByConfig.set( configPath, configTests );
	}

	for ( const [ baseConfigPath, typeScriptTests ] of testsByConfig ) {
		const needsNodeTypes =
			projectName === 'node' ||
			typeScriptTests.some( ( file ) =>
				/[('"]node:/.test(
					readFileSync( path.join( ROOT_DIR, file ), 'utf8' )
				)
			);
		const temporaryDirectory = mkdtempSync(
			path.join(
				os.tmpdir(),
				`gutenberg-vitest-${ projectName }-typecheck-`
			)
		);
		const configPath = path.join( temporaryDirectory, 'tsconfig.json' );
		const compatibilityTypesPath = path.join(
			temporaryDirectory,
			'compatibility.d.ts'
		);
		const setupTypeFiles = [];
		if ( projectName === 'browser' ) {
			setupTypeFiles.push(
				path.join( ROOT_DIR, 'test/unit/config/browser.vitest.js' )
			);
		} else if ( projectName === 'jsdom' ) {
			setupTypeFiles.push(
				path.join(
					ROOT_DIR,
					'test/unit/config/testing-library.vitest.js'
				)
			);
		}
		const typecheckConfig = {
			extends: baseConfigPath,
			compilerOptions: {
				allowJs: true,
				checkJs: false,
				composite: false,
				declaration: true,
				declarationMap: false,
				emitDeclarationOnly: false,
				noEmit: true,
				rootDir: ROOT_DIR,
				typeRoots: [
					path.join( ROOT_DIR, 'typings' ),
					path.join( ROOT_DIR, 'node_modules/@types' ),
				],
				types: [
					...commonTypes,
					...( needsNodeTypes ? [ 'node' ] : [] ),
					'gutenberg-vitest-test-env',
				],
			},
			// Package configs often include every source, story, and test file.
			// This validator owns an exact routed-test set, so do not inherit
			// those broader globs into another Vitest project's typecheck.
			include: [],
			exclude: [],
			files: [
				compatibilityTypesPath,
				...setupTypeFiles,
				...typeScriptTests.map( ( file ) =>
					path.join( ROOT_DIR, file )
				),
			],
		};

		try {
			// Keep narrow compatibility declarations for JavaScript packages
			// without published types and migrated tests that still use Node's
			// `global` alias without injecting all Node globals into browser
			// packages.
			writeFileSync(
				compatibilityTypesPath,
				[
					'declare const global: typeof globalThis;',
					"declare module '@wordpress/block-editor' {",
					"\texport const store: import('@wordpress/data').StoreDescriptor<import('@wordpress/data').ReduxStoreConfig<any, Record<string, (...args: any[]) => any>, Record<string, (...args: any[]) => any>>>;",
					'}',
					"declare module '@wordpress/commands';",
					"declare module '@wordpress/interface';",
					"declare module 'deep-freeze' { export default function deepFreeze<T>(value: T): T; }",
				].join( '\n' )
			);
			writeFileSync( configPath, JSON.stringify( typecheckConfig ) );
			execFileSync(
				resolvePackageBin( 'typescript' ),
				[ '--project', configPath, '--pretty', 'false' ],
				{ cwd: ROOT_DIR, stdio: 'inherit' }
			);
		} finally {
			rmSync( temporaryDirectory, { force: true, recursive: true } );
		}
	}
}

console.log(
	`Validated ${ vitestTests.length } Vitest tests, ${ files.length } ESM graph files, ${ vitestVersions.size } workspace dependencies, and ${ typescriptTests.length } TypeScript tests.`
);
