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

const NODE_TEST_FILES = [
	'packages/compose/src/hooks/use-media-query/test/ssr.jsx',
	'packages/report-flaky-tests/src/__tests__/run.test.ts',
	'packages/theme/src/stylelint-plugins/test/no-setting-wpds-custom-properties.test.ts',
	'packages/theme/src/stylelint-plugins/test/no-token-fallback-values.test.ts',
	'packages/theme/src/stylelint-plugins/test/no-unknown-ds-tokens.test.ts',
	'tools/validation/validate-package-contents.test.js',
];

const NODE_TEST_DIRECTORIES = [
	'packages/babel-plugin-import-jsx-pragma',
	'packages/babel-plugin-makepot',
	'packages/babel-preset-default',
	'packages/block-serialization-default-parser',
	'packages/block-serialization-spec-parser',
	'packages/browserslist-config',
	'packages/data-controls',
	'packages/dependency-extraction-webpack-plugin',
	'packages/design-system-mcp',
	'packages/docgen',
	'packages/eslint-plugin',
	'packages/env',
	'packages/global-styles-engine',
	'packages/npm-package-json-lint-config',
	'packages/postcss-themes',
	'packages/preferences',
	'packages/prettier-config',
	'packages/project-management-automation',
	'packages/readable-js-assets-webpack-plugin',
	'packages/redux-routine',
	'packages/scripts',
	'packages/stylelint-config',
	'packages/video-conversion',
	'packages/vips',
	'packages/views',
	'packages/vitest-console',
	'packages/vitest-preset-default',
	'packages/worker-threads',
	'packages/wp-build',
	'test/unit/scripts',
	'tools/agents',
	'tools/release',
];

function normalizeTestPath( testPath ) {
	return testPath.split( path.sep ).join( '/' );
}

export function isBrowserTestPath( testPath ) {
	return BROWSER_TEST_PATH_PATTERN.test( normalizeTestPath( testPath ) );
}

function isWithinDirectory( testPath, directoryPath ) {
	return (
		testPath === directoryPath ||
		testPath.startsWith( `${ directoryPath }/` )
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

export function getVitestTestsByProject( rootDir ) {
	const discoveredTests = discoverTestFiles( rootDir );
	const discoveredTestSet = new Set( discoveredTests );
	const missingConfiguredTests = NODE_TEST_FILES.filter(
		( testPath ) => ! discoveredTestSet.has( testPath )
	);

	if ( missingConfiguredTests.length ) {
		throw new Error(
			`Configured Vitest tests were not discovered:\n${ missingConfiguredTests.join(
				'\n'
			) }`
		);
	}

	const browserTestSet = new Set(
		discoveredTests.filter( isBrowserTestPath )
	);
	const nodeTestSet = new Set(
		discoveredTests.filter(
			( testPath ) =>
				NODE_TEST_FILES.includes( testPath ) ||
				NODE_TEST_DIRECTORIES.some( ( directoryPath ) =>
					isWithinDirectory( testPath, directoryPath )
				)
		)
	);
	const overlappingTests = [ ...browserTestSet ].filter( ( testPath ) =>
		nodeTestSet.has( testPath )
	);

	if ( overlappingTests.length ) {
		throw new Error(
			`Vitest tests belong to multiple projects:\n${ overlappingTests.join(
				'\n'
			) }`
		);
	}

	return {
		browser: [ ...browserTestSet ].sort(),
		jsdom: discoveredTests.filter(
			( testPath ) =>
				! browserTestSet.has( testPath ) &&
				! nodeTestSet.has( testPath )
		),
		node: [ ...nodeTestSet ].sort(),
	};
}

export function getVitestTests( rootDir ) {
	return [
		...new Set(
			Object.values( getVitestTestsByProject( rootDir ) ).flat()
		),
	].sort();
}
