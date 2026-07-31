/**
 * External dependencies
 */
import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

/**
 * Internal dependencies
 */
import { Composite } from '..';

test( 'moves focus through a composite with real keyboard input', async () => {
	const user = userEvent.setup();
	await render(
		<>
			<button>Before</button>
			<Composite>
				<Composite.Item>Item 1</Composite.Item>
				<Composite.Item>Item 2</Composite.Item>
				<Composite.Item>Item 3</Composite.Item>
			</Composite>
			<button>After</button>
		</>
	);
	const before = page.getByRole( 'button', { name: 'Before' } );
	const firstItem = page.getByRole( 'button', { name: 'Item 1' } );
	const secondItem = page.getByRole( 'button', { name: 'Item 2' } );
	const after = page.getByRole( 'button', { name: 'After' } );

	await user.tab();
	await expect.element( before ).toHaveFocus();

	await user.tab();
	await expect.element( firstItem ).toHaveFocus();

	await user.keyboard( '{ArrowDown}' );
	await expect.element( secondItem ).toHaveFocus();

	await user.tab();
	await expect.element( after ).toHaveFocus();
} );
