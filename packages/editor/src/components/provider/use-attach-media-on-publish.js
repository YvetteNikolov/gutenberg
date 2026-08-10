/**
 * WordPress dependencies
 */
import { useEffect, useRef } from '@wordpress/element';
import { useSelect } from '@wordpress/data';

/**
 * Internal dependencies
 */
import { store as editorStore } from '../../store';
import { flushPendingAttachments } from '../../utils/attach-media';

/**
 * Attaches media that was selected while the post was not yet publicly
 * viewable, once the post becomes publicly viewable.
 *
 * Attaching a previously-unattached image to a draft would demote that image to
 * draft visibility everywhere it is used, because an attachment's `inherit`
 * status resolves through its parent on every read. So selections made while
 * drafting are buffered by `attachMediaToPost` and written here instead.
 *
 * The saved post status is watched rather than the edited one: an unsaved switch
 * to "publish" hasn't made the post publicly viewable yet, and the user may
 * still abandon it.
 */
export default function useAttachMediaOnPublish() {
	const { postId, isPubliclyViewable } = useSelect( ( select ) => {
		const { getCurrentPostId, getCurrentPost } = select( editorStore );

		return {
			postId: getCurrentPostId(),
			// Not `isCurrentPostPublished`, which also counts `private` (never
			// publicly viewable) and `future` (not viewable yet).
			isPubliclyViewable: getCurrentPost()?.status === 'publish',
		};
	}, [] );

	const wasPubliclyViewableRef = useRef( isPubliclyViewable );

	useEffect( () => {
		// Only the transition matters. Flushing on every render where the post
		// happens to be published would be harmless but pointless, and flushing
		// on mount would fire for posts that were already public.
		if ( isPubliclyViewable && ! wasPubliclyViewableRef.current ) {
			flushPendingAttachments( postId );
		}

		wasPubliclyViewableRef.current = isPubliclyViewable;
	}, [ isPubliclyViewable, postId ] );
}
