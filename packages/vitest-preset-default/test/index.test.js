/**
 * External dependencies
 */
import { describe, expect, test } from 'vitest';

/**
 * Internal dependencies
 */
import preset from '../index.js';

describe( '@wordpress/vitest-preset-default', () => {
	test( 'uses jsdom with explicit Vitest imports', () => {
		expect( preset.test ).toMatchObject( {
			environment: 'jsdom',
			globals: false,
		} );
	} );

	test( 'loads setup files in a deterministic order', () => {
		expect( preset.test.sequence ).toEqual( {
			hooks: 'list',
			setupFiles: 'list',
		} );
		expect( preset.test.setupFiles ).toHaveLength( 2 );
	} );
} );
