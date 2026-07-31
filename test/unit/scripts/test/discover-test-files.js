/**
 * External dependencies
 */
import { describe, expect, test } from 'vitest';

/**
 * Internal dependencies
 */
import {
	assertVitestProjectNames,
	findOverlappingVitestProjectTests,
	isBrowserTestPath,
} from '../discover-test-files.mjs';
import {
	hasBrowserModeImport,
	hasTestEnvironmentOverride,
} from '../vitest-conventions.mjs';

describe( 'Vitest project routing', () => {
	test( 'accepts the browser, jsdom, and node projects', () => {
		expect( () =>
			assertVitestProjectNames( 'vitest.projects', {
				browser: {},
				jsdom: {},
				node: {},
			} )
		).not.toThrow();
	} );

	test( 'rejects a missing Vitest project', () => {
		expect( () =>
			assertVitestProjectNames( 'vitest.projects', {
				jsdom: {},
				node: {},
			} )
		).toThrow(
			'vitest.projects must define exactly these projects: browser, jsdom, node.'
		);
	} );

	test( 'rejects an unknown Vitest project', () => {
		expect( () =>
			assertVitestProjectNames( 'vitest.projects', {
				browser: {},
				jsdom: {},
				node: {},
				worker: {},
			} )
		).toThrow(
			'vitest.projects must define exactly these projects: browser, jsdom, node.'
		);
	} );

	test( 'reports tests owned by multiple projects', () => {
		expect(
			findOverlappingVitestProjectTests( {
				browser: [ 'packages/components/src/test/index.js' ],
				jsdom: [ 'packages/components/src/test/index.js' ],
				node: [ 'tools/example/test/index.js' ],
			} )
		).toEqual( [
			'packages/components/src/test/index.js: browser, jsdom',
		] );
	} );

	test( 'recognizes colocated Browser Mode test filenames', () => {
		expect(
			isBrowserTestPath(
				'packages/components/src/button/test/index.browser.test.tsx'
			)
		).toBe( true );
		expect(
			isBrowserTestPath(
				'packages/components/src/button/test/index.test.tsx'
			)
		).toBe( false );
		expect(
			isBrowserTestPath( 'packages/components/src/button/test/index.tsx' )
		).toBe( false );
	} );

	test( 'detects Browser Mode imports', () => {
		const vitestBrowser = [ 'vitest', '/browser' ].join( '' );
		const vitestBrowserReact = [ 'vitest', '-browser-react' ].join( '' );

		expect(
			hasBrowserModeImport(
				`import { userEvent } from '${ vitestBrowser }';`
			)
		).toBe( true );
		expect(
			hasBrowserModeImport(
				`import { render } from '${ vitestBrowserReact }';`
			)
		).toBe( true );
		expect(
			hasBrowserModeImport(
				"import userEvent from '@testing-library/user-event';"
			)
		).toBe( false );
	} );

	test( 'detects per-file Vitest and Jest environment overrides', () => {
		const vitestEnvironment = [ '@vitest', '-environment' ].join( '' );
		const jestEnvironment = [ '@jest', '-environment' ].join( '' );

		expect(
			hasTestEnvironmentOverride( `// ${ vitestEnvironment } node` )
		).toBe( true );
		expect(
			hasTestEnvironmentOverride( `/** ${ jestEnvironment } jsdom */` )
		).toBe( true );
	} );

	test( 'allows per-file environment options', () => {
		const vitestEnvironmentOptions = [
			'@vitest',
			'-environment-options',
		].join( '' );

		expect(
			hasTestEnvironmentOverride(
				`// ${ vitestEnvironmentOptions } { "url": "https://example.com" }`
			)
		).toBe( false );
	} );
} );
