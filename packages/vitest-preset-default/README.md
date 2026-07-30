# Default Vitest Preset

Default [Vitest](https://vitest.dev/) configuration for WordPress projects.
It uses an ESM-only configuration, the `jsdom` environment, explicit Vitest
imports, SWC React transforms, deterministic CSS mock class names, and
`@wordpress/vitest-console`.

## Installation

```bash
npm install --save-dev @wordpress/vitest-preset-default vite vitest
```

Create `vitest.config.js`:

```js
export { default } from '@wordpress/vitest-preset-default';
```

Vitest globals remain disabled. Import the APIs used by each test:

```js
import { expect, test, vi } from 'vitest';
```

For React tests, keep using Testing Library. Import
`@testing-library/jest-dom/vitest` from a setup file and register explicit
cleanup when globals are disabled:

```js
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach( cleanup );
```

To extend the preset, merge it with project-specific configuration:

```js
import wordpressConfig from '@wordpress/vitest-preset-default';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
	wordpressConfig,
	defineConfig( {
		test: {
			setupFiles: [ './test/setup.js' ],
		},
	} )
);
```

## Contributing

This package is part of the Gutenberg monorepo. See the
[contributor guide](https://github.com/WordPress/gutenberg/blob/HEAD/CONTRIBUTING.md).
