/**
 * WordPress dependencies
 */
import { dispatch, select } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';

/**
 * Internal dependencies
 */
import { store as editorStore } from '../../store';
import {
	getAttachmentParent,
	getImageAttachmentIds,
	normalizePostId,
	saveAttachmentParent,
} from './helpers';

export {
	getAttachmentParent,
	getImageAttachmentIds,
	getMediaItemType,
	normalizePostId,
	saveAttachmentParent,
} from './helpers';

/**
 * Invalidates every cached `getEntityRecords` resolution for attachments, so
 * surfaces that list media by parent — the Gallery block's dynamic mode and the
 * "Attached images" inserter tab — re-resolve against the server.
 *
 * This mirrors `invalidateAttachmentResolutions` in `@wordpress/media-utils`,
 * deliberately rather than importing it: that package's entry point pulls in
 * `MediaUploadModal` and therefore all of `@wordpress/components`, which is far
 * too much to drag in for ten lines of cache bookkeeping.
 *
 * `invalidateResolution` alone only clears the exact query passed to it, which
 * would leave a paginated grid stale on every page but the one asked for.
 */
function invalidateAttachmentResolutions() {
	const resolvers = select( coreStore ).getCachedResolvers();

	resolvers?.getEntityRecords?.forEach( ( _value, args ) => {
		if ( args[ 0 ] === 'postType' && args[ 1 ] === 'attachment' ) {
			dispatch( coreStore ).invalidateResolution(
				'getEntityRecords',
				args
			);
		}
	} );
}

/**
 * Describes whether the post being edited can have media attached to it, and
 * whether it is public enough for attaching to be safe right now.
 *
 * `isPubliclyViewable` intentionally does not reuse the `isCurrentPostPublished`
 * selector: that selector counts `private` (which is not publicly viewable) and
 * `future` (which is not viewable *yet*). Attaching a public image to either
 * would demote it globally, which is what the gate exists to prevent.
 *
 * @return {Object|undefined} `{ postId, isPubliclyViewable }`, or `undefined`
 *                            when the current post can't take attachments.
 */
export function getAttachablePostContext() {
	const { getCurrentPostId, getCurrentPostType, getCurrentPost } =
		select( editorStore );

	const postId = normalizePostId( getCurrentPostId() );
	if ( ! postId ) {
		return undefined;
	}

	// Templates, template parts, patterns, navigation menus and global styles
	// are not viewable, and nothing should ever be parented to them.
	const postType = select( coreStore ).getPostType( getCurrentPostType() );
	if ( ! postType?.viewable ) {
		return undefined;
	}

	// Read the *saved* status rather than an edited one: an unsaved switch to
	// "publish" doesn't make the post publicly viewable yet.
	return {
		postId,
		isPubliclyViewable: getCurrentPost()?.status === 'publish',
	};
}

// Attachment IDs seen while the post was not yet publicly viewable, keyed by
// post ID, waiting for the save that publishes it. Module-level rather than
// store state: this is a transient side-effect buffer, not editor state, and
// nothing should be able to undo/redo or persist it.
const pendingAttachments = new Map();

/**
 * Writes the given attachment IDs to the post, batching where it helps.
 *
 * @param {number[]} attachmentIds Attachment IDs to attach.
 * @param {number}   postId        Post to attach them to.
 *
 * @return {Promise<void>} Resolves once the write settles, successfully or not.
 */
async function writeAttachments( attachmentIds, postId ) {
	if ( ! attachmentIds.length ) {
		return;
	}

	try {
		if ( attachmentIds.length === 1 ) {
			// A single write skips the OPTIONS preflight that the batch
			// endpoint needs, which is the common case by a wide margin.
			await saveAttachmentParent( attachmentIds[ 0 ], postId );
		} else {
			await dispatch( coreStore ).__experimentalBatch(
				attachmentIds.map(
					( attachmentId ) =>
						( { saveEntityRecord } ) =>
							saveEntityRecord( 'postType', 'attachment', {
								id: attachmentId,
								post: postId,
							} )
				)
			);
		}

		// Both media modals invalidate the attachment cache when they close,
		// but this write is deliberately not awaited by them, so it can land
		// after that invalidation. Invalidate again here so the surfaces that
		// list media by parent pick the new parent up.
		invalidateAttachmentResolutions();
	} catch ( error ) {
		// Attaching is a silent convenience: a failure leaves the media
		// unattached, which is exactly the state it was already in. Never
		// interpolate the error — a rejected `apiFetch` is not reliably an
		// `Error`, so `${ error }` can yield "[object Object]".
		window.console.warn( 'Could not attach media to the post.', error );
	}
}

/**
 * Attaches any unattached media in a picker selection to the post being edited.
 *
 * Fire-and-forget by contract: callers must not await this, so a slow or failed
 * write can never block editing. Items already attached to another post are
 * skipped, as are items whose parent the payload didn't report.
 *
 * @param {Object|Object[]} mediaItems The picker's selection payload.
 */
export function attachMediaToPost( mediaItems ) {
	const context = getAttachablePostContext();
	if ( ! context ) {
		return;
	}

	const { postId, isPubliclyViewable } = context;
	const items = Array.isArray( mediaItems ) ? mediaItems : [ mediaItems ];

	// Only fill an empty parent. Never steal one, and never guess: writing to an
	// attachment already owned by another post silently reparents it, which the
	// user has no way to notice or undo.
	const attachable = items.filter(
		( mediaItem ) => getAttachmentParent( mediaItem ) === 0
	);
	const attachmentIds = getImageAttachmentIds( attachable );

	if ( ! attachmentIds.length ) {
		return;
	}

	if ( ! isPubliclyViewable ) {
		// Attaching a public image to a draft demotes it to draft visibility on
		// every post that uses it, not just this one, because an attachment's
		// `inherit` status resolves through its parent on every read. Hold the
		// IDs until the post is published.
		const pending = pendingAttachments.get( postId ) ?? new Set();
		attachmentIds.forEach( ( id ) => pending.add( id ) );
		pendingAttachments.set( postId, pending );
		return;
	}

	writeAttachments( attachmentIds, postId );
}

/**
 * Writes any attachments buffered while the post was not publicly viewable.
 *
 * Draining before writing keeps this idempotent: a second call for the same
 * post is a no-op rather than a duplicate write.
 *
 * @param {number} postId Post that has just become publicly viewable.
 *
 * @return {Promise<void>} Resolves once the write settles.
 */
export async function flushPendingAttachments( postId ) {
	const normalizedPostId = normalizePostId( postId );
	if ( ! normalizedPostId ) {
		return;
	}

	const pending = pendingAttachments.get( normalizedPostId );
	if ( ! pending?.size ) {
		return;
	}

	pendingAttachments.delete( normalizedPostId );

	await writeAttachments( [ ...pending ], normalizedPostId );
}

/**
 * Clears the pending buffer. Test-only seam.
 */
export function clearPendingAttachments() {
	pendingAttachments.clear();
}
