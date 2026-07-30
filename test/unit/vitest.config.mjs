/**
 * Node dependencies
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * External dependencies
 */
import react from '@vitejs/plugin-react-swc';
import { playwright } from '@vitest/browser-playwright';
import globPackage from 'glob';
import { defineConfig } from 'vitest/config';

/**
 * Internal dependencies
 */
import { getVitestTestsByProject } from './scripts/test-projects.mjs';

const ROOT_DIR = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'../..'
);
const vitestTests = getVitestTestsByProject( ROOT_DIR );
const { sync: glob } = globPackage;
const reporters = [ 'default' ];
const styleMockAlias = {
	find: /^.*\.(?:css|scss)$/,
	replacement: fileURLToPath(
		import.meta.resolve( '@wordpress/vitest-preset-default/style-mock' )
	),
};
const setupGlobals = fileURLToPath(
	import.meta.resolve( '@wordpress/vitest-preset-default/setup-globals' )
);

if ( process.env.GITHUB_ACTIONS === 'true' ) {
	reporters.push( 'github-actions' );
}
if (
	process.env.CI &&
	process.env.GITHUB_REPOSITORY === 'WordPress/gutenberg'
) {
	reporters.push( [
		'@flakiness/vitest',
		{
			duplicates: 'rename',
			flakinessProject: 'WordPress/gutenberg',
		},
	] );
}

// Preserve repository-root configuration discovery and default to UTC while
// allowing the date-test matrix to supply another timezone.
process.chdir( ROOT_DIR );
process.env.TZ ||= 'UTC';

const transpiledPackageNames = glob(
	path.join( ROOT_DIR, 'packages/*/src/index.{js,jsx,ts,tsx}' )
).map( ( fileName ) => {
	const relative = path.relative( ROOT_DIR, fileName );
	return relative.split( path.sep )[ 1 ];
} );

export default defineConfig( {
	root: ROOT_DIR,
	plugins: [
		react( {
			plugins: [
				[
					'@swc/plugin-emotion',
					{
						// Preserve the Emotion labels used by existing
						// snapshots regardless of NODE_ENV.
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
				find: /^yargs$/,
				replacement: path.join(
					ROOT_DIR,
					'test/unit/config/yargs.vitest.js'
				),
			},
			{
				find: '@wordpress/vips/worker',
				replacement: path.join(
					ROOT_DIR,
					'test/unit/config/vips-worker-code-stub.vitest.js'
				),
			},
			{
				find: '@wordpress/video-conversion/worker',
				replacement: path.join(
					ROOT_DIR,
					'test/unit/config/video-conversion-worker-code-stub.vitest.js'
				),
			},
			{
				find: /^@wordpress\/([^/]+)\/src\/(.+)$/,
				replacement: path.join( ROOT_DIR, 'packages/$1/src/$2' ),
			},
			{
				find: new RegExp(
					`^@wordpress/(${ transpiledPackageNames.join( '|' ) })$`
				),
				replacement: path.join( ROOT_DIR, 'packages/$1/src' ),
			},
			{
				find: '@wordpress/theme/design-tokens.js',
				replacement: path.join(
					ROOT_DIR,
					'packages/theme/prebuilt/js/design-tokens.mjs'
				),
			},
			{
				find: /^@wordpress\/block-library\/build-module\/(.*)\.mjs$/,
				replacement: path.join(
					ROOT_DIR,
					'packages/block-library/src/$1'
				),
			},
			{
				find: /.+\.wasm$/,
				replacement: path.join(
					ROOT_DIR,
					'test/unit/config/wasm-stub.js'
				),
			},
		],
	},
	test: {
		globals: false,
		includeTaskLocation: true,
		passWithNoTests: false,
		projects: [
			{
				extends: true,
				optimizeDeps: {
					entries: vitestTests.browser,
					include: [
						'@base-ui/react',
						'@base-ui/react/alert-dialog',
						'@base-ui/react/autocomplete',
						'@base-ui/react/button',
						'@base-ui/react/checkbox',
						'@base-ui/react/collapsible',
						'@base-ui/react/combobox',
						'@base-ui/react/dialog',
						'@base-ui/react/drawer',
						'@base-ui/react/field',
						'@base-ui/react/fieldset',
						'@base-ui/react/input',
						'@base-ui/react/popover',
						'@base-ui/react/select',
						'@base-ui/react/tabs',
						'@base-ui/react/tooltip',
						'@date-fns/utc',
						'@emotion/cache',
						'@emotion/styled/base',
						'@floating-ui/react-dom',
						'@testing-library/jest-dom/vitest',
						'@testing-library/react',
						'@use-gesture/react',
						'@wordpress/components > react-colorful',
						'colord/plugins/a11y',
						'colorjs.io/fn',
						'date-fns',
						'deepmerge',
						'equivalent-key-map',
						'fast-deep-equal/es6/index.js',
						'gradient-parser',
						'highlight-words-core',
						'is-promise',
						'moment',
						'moment-timezone/moment-timezone-utils.js',
						'moment-timezone/moment-timezone.js',
						'path-to-regexp',
						're-resizable',
						'react-day-picker',
						'react-day-picker/locale',
						'rememo',
						'remove-accents',
						'redux',
						'rungen',
						'tabbable',
						'uuid',
					],
				},
				test: {
					name: 'browser',
					attachmentsDir: 'test-results/vitest-browser-attachments',
					include: vitestTests.browser,
					setupFiles: [
						path.join(
							ROOT_DIR,
							'test/unit/config/browser.vitest.js'
						),
						path.join(
							ROOT_DIR,
							'test/unit/config/gutenberg-env.js'
						),
						path.join(
							ROOT_DIR,
							'test/unit/config/console.vitest.js'
						),
					],
					browser: {
						enabled: true,
						headless: true,
						instances: [ { browser: 'chromium' } ],
						provider: playwright(),
						screenshotDirectory:
							'test-results/vitest-browser-screenshots',
						screenshotFailures: true,
						trace: {
							mode: 'retain-on-failure',
							tracesDir: 'test-results/vitest-browser-traces',
						},
					},
				},
			},
			{
				extends: true,
				resolve: {
					alias: [ styleMockAlias ],
				},
				test: {
					// The Flakiness.io reporter uses the project name as part
					// of its environment identity. Preserve the historical
					// default while the manifest records explicit jsdom
					// ownership.
					name: 'vitest',
					environment: 'jsdom',
					environmentOptions: {
						jsdom: {
							url: 'http://localhost/',
						},
					},
					include: vitestTests.jsdom,
					setupFiles: [
						setupGlobals,
						path.join(
							ROOT_DIR,
							'test/unit/config/global-mocks.vitest.js'
						),
						path.join(
							ROOT_DIR,
							'test/unit/config/gutenberg-env.js'
						),
						path.join(
							ROOT_DIR,
							'test/unit/config/console.vitest.js'
						),
						path.join(
							ROOT_DIR,
							'test/unit/config/testing-library.vitest.js'
						),
						path.join(
							ROOT_DIR,
							'test/unit/mocks/match-media.vitest.js'
						),
					],
				},
			},
			{
				extends: true,
				resolve: {
					alias: [ styleMockAlias ],
				},
				test: {
					name: 'node',
					environment: 'node',
					include: vitestTests.node,
					setupFiles: [
						path.join(
							ROOT_DIR,
							'test/unit/config/gutenberg-env.js'
						),
						path.join(
							ROOT_DIR,
							'test/unit/config/console.vitest.js'
						),
					],
				},
			},
		],
		reporters,
		sequence: {
			hooks: 'list',
			setupFiles: 'list',
		},
		snapshotFormat: {
			escapeString: false,
			printBasicPrototype: false,
		},
	},
} );
