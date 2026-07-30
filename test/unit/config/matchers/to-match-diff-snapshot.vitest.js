/**
 * External dependencies
 */
import { expect, Snapshots } from 'vitest';

const identity = ( value ) => value;

export function normalizeEmotionClassNames( ...values ) {
	const replacements = new Map();

	return values.map( ( value ) => {
		if (
			typeof value?.cloneNode !== 'function' ||
			typeof value?.querySelectorAll !== 'function'
		) {
			return value;
		}

		const clone = value.cloneNode( true );
		const elements = [ clone, ...clone.querySelectorAll( '[class]' ) ];

		for ( const element of elements ) {
			const className = element.getAttribute?.( 'class' );
			if ( ! className ) {
				continue;
			}

			const normalizedClassName = className
				.split( /\s+/ )
				.map( ( item ) => {
					const match = item.match( /^css-[a-z0-9]+(?:-(.+))?$/ );
					if ( ! match ) {
						return item;
					}

					if ( ! replacements.has( item ) ) {
						const label = match[ 1 ] ? `-${ match[ 1 ] }` : '';
						replacements.set(
							item,
							`emotion-diff-${ replacements.size }${ label }`
						);
					}

					return replacements.get( item );
				} )
				.join( ' ' );

			element.setAttribute( 'class', normalizedClassName );
		}

		return clone;
	} );
}

export function snapshotDiff( valueA, valueB, options = {}, utils ) {
	const [ normalizedValueA, normalizedValueB ] = normalizeEmotionClassNames(
		valueA,
		valueB
	);
	const difference = utils.diff( normalizedValueA, normalizedValueB, {
		aAnnotation: 'First value',
		aColor: identity,
		bAnnotation: 'Second value',
		bColor: identity,
		changeColor: identity,
		commonColor: identity,
		contextLines: -1,
		expand: false,
		patchColor: identity,
		printBasicPrototype: true,
		...options,
	} );

	return `Snapshot Diff:\n${
		difference ?? 'Compared values have no visual difference.'
	}`;
}

function toMatchDiffSnapshot(
	received,
	expected,
	options = {},
	testName = ''
) {
	return Snapshots.toMatchSnapshot.call(
		this,
		snapshotDiff( received, expected, options, this.utils ),
		testName
	);
}

expect.extend( { toMatchDiffSnapshot } );
