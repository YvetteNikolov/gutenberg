/**
 * Node dependencies
 */
import path from 'node:path';

/**
 * External dependencies
 */
import { describe, expect, test } from 'vitest';

/**
 * Internal dependencies
 */
import {
	discoverTestFiles,
	getVitestTestsByProject,
	isBrowserTestPath,
} from '../test-projects.mjs';

const ROOT_DIR = path.resolve( import.meta.dirname, '../../../..' );

describe( 'Vitest project routing', () => {
	test( 'recognizes colocated Browser Mode filenames', () => {
		expect(
			isBrowserTestPath(
				'packages/components/src/button/test/index.browser.test.tsx'
			)
		).toBe( true );
		expect(
			isBrowserTestPath(
				'packages/components/src/button/test/index.browser.spec.jsx'
			)
		).toBe( true );
		expect(
			isBrowserTestPath(
				'packages/components/src/button/test/index.test.tsx'
			)
		).toBe( false );
	} );

	test( 'assigns every discovered test to exactly one project', () => {
		const discoveredTests = discoverTestFiles( ROOT_DIR );
		const testsByProject = getVitestTestsByProject( ROOT_DIR );
		const routedTests = Object.values( testsByProject ).flat();

		expect( new Set( routedTests ).size ).toBe( routedTests.length );
		expect( [ ...new Set( routedTests ) ].sort() ).toEqual(
			discoveredTests
		);
		expect( testsByProject.browser.length ).toBeGreaterThan( 0 );
		expect( testsByProject.browser.every( isBrowserTestPath ) ).toBe(
			true
		);
	} );
} );
