/**
 * External dependencies
 */
import react from '@vitejs/plugin-react-swc';
import { configDefaults, defineConfig } from 'vitest/config';

const setupGlobals = '@wordpress/vitest-preset-default/setup-globals';
const setupTestFramework =
	'@wordpress/vitest-preset-default/setup-test-framework';
const styleMock = '@wordpress/vitest-preset-default/style-mock';

export default defineConfig( {
	plugins: [
		react( {
			plugins: [
				[
					'@swc/plugin-emotion',
					{
						autoLabel: 'always',
						labelFormat: '[local]',
					},
				],
			],
		} ),
	],
	resolve: {
		alias: [
			{
				find: /^.*\.(?:css|scss)$/,
				replacement: styleMock,
			},
		],
	},
	test: {
		environment: 'jsdom',
		exclude: [ ...configDefaults.exclude, '**/vendor/**' ],
		globals: false,
		include: [
			'**/__tests__/**/*.{js,jsx,ts,tsx}',
			'**/test/*.{js,jsx,ts,tsx}',
			'**/*.test.{js,jsx,ts,tsx}',
		],
		includeTaskLocation: true,
		sequence: {
			hooks: 'list',
			setupFiles: 'list',
		},
		setupFiles: [ setupGlobals, setupTestFramework ],
		snapshotFormat: {
			escapeString: false,
			printBasicPrototype: false,
		},
	},
} );
