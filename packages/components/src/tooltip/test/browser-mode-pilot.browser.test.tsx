/**
 * External dependencies
 */
import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

/**
 * Internal dependencies
 */
import Tooltip from '..';

test( 'shows a portal tooltip through real pointer input', async () => {
	const user = userEvent.setup();
	const view = await render(
		<Tooltip delay={ 0 } text="Browser mode tooltip">
			<button>Tooltip anchor</button>
		</Tooltip>
	);
	const anchor = page.getByRole( 'button', {
		name: 'Tooltip anchor',
	} );
	const tooltip = page.getByRole( 'tooltip', {
		name: 'Browser mode tooltip',
	} );

	await expect.element( tooltip ).not.toBeInTheDocument();
	await user.hover( anchor );
	await expect.element( tooltip ).toBeVisible();
	await expect
		.element( anchor )
		.toHaveAttribute( 'aria-describedby', tooltip.element().id );

	expect( view.container.contains( tooltip.element() ) ).toBe( false );
} );
