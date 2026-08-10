/**
 * WordPress dependencies
 */
import { addFilter } from '@wordpress/hooks';
import { useCallback } from '@wordpress/element';
import { createHigherOrderComponent } from '@wordpress/compose';

/**
 * Internal dependencies
 */
import { attachMediaToPost } from '../utils/attach-media';

/**
 * Attaches unattached media to the post being edited when it is selected from a
 * picker, mirroring what uploading an image already does.
 *
 * This wraps whatever component is registered on `editor.MediaUpload` rather
 * than any particular modal, so it covers the classic Backbone modal and the
 * DataViews modal alike — and any block that renders `MediaUpload`, including
 * third-party ones — without either modal knowing about it.
 */
const withAutoAttachMedia = createHigherOrderComponent(
	( MediaUpload ) =>
		( { onSelect, __unstableAutoAttach = true, ...props } ) => {
			const handleSelect = useCallback(
				( media ) => {
					// Update the block first and unconditionally: attaching is a
					// background convenience and must never interfere with, or
					// delay, the selection actually landing in the editor.
					onSelect?.( media );

					if ( __unstableAutoAttach ) {
						// Deliberately not awaited — see `attachMediaToPost`.
						attachMediaToPost( media );
					}
				},
				[ onSelect, __unstableAutoAttach ]
			);

			return <MediaUpload { ...props } onSelect={ handleSelect } />;
		},
	'withAutoAttachMedia'
);

if ( window.__experimentalAutoAttachMedia ) {
	// Priority 20 so this runs after `core/editor/components/media-upload`,
	// which *returns* a fixed component and ignores the one passed to it. A
	// lower priority here would be silently discarded.
	addFilter(
		'editor.MediaUpload',
		'core/editor/auto-attach-media',
		withAutoAttachMedia,
		20
	);
}
