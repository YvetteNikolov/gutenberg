/**
 * WordPress dependencies
 */
import { dispatch } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';

/**
 * Normalizes a post ID to a positive integer, or `undefined` when it isn't one.
 *
 * Templates and template parts keep their numerical ID in `wp_id` rather than
 * `id`; that fallback is deliberately *not* applied here, since those post types
 * are not attachable in the first place.
 *
 * @param {number|string} postId Post ID to normalize.
 *
 * @return {number|undefined} The post ID, or `undefined`.
 */
export const normalizePostId = ( postId ) => {
	const parsedPostId = typeof postId === 'number' ? postId : Number( postId );

	return Number.isInteger( parsedPostId ) && parsedPostId > 0
		? parsedPostId
		: undefined;
};

/**
 * Writes an attachment's parent post.
 *
 * @param {number} attachmentId Attachment ID.
 * @param {number} postId       Post ID to attach to, or `0` to detach.
 *
 * @return {Promise<Object>} The updated attachment record.
 */
export const saveAttachmentParent = ( attachmentId, postId ) =>
	// `throwOnError` so a failed REST write rejects (rather than being silently
	// swallowed), letting callers surface an error notice instead of a false
	// success.
	dispatch( coreStore ).saveEntityRecord(
		'postType',
		'attachment',
		{
			id: attachmentId,
			post: postId,
		},
		{ throwOnError: true }
	);

// A selected media item's coarse type is exposed differently by each picker.
// The classic media modal puts the media type directly on `type` (e.g. 'image').
// The DataViews-driven modal passes REST attachment records, where `type` is the
// *post* type ('attachment') and the media type lives in `media_type`
// ('image'|'file') / `mime_type`. So the REST fields must be read first, with
// `type` as the classic-modal fallback — otherwise a REST image reads as
// 'attachment' and gets gated out.
export const getMediaItemType = ( mediaItem ) =>
	mediaItem?.media_type ||
	mediaItem?.mime_type?.split( '/' )[ 0 ] ||
	mediaItem?.type;

/**
 * Collects the deduplicated IDs of the image items in a media selection.
 *
 * The picker's "Upload files" tab accepts any file type, so a selection can
 * include non-images. Gating to images only keeps a non-image from being
 * reparented to the post when it would never appear in the image-filtered grid.
 *
 * @param {Object|Object[]} mediaItems A media item, or a list of them.
 *
 * @return {number[]} Image attachment IDs.
 */
export const getImageAttachmentIds = ( mediaItems ) => [
	...new Set(
		( Array.isArray( mediaItems ) ? mediaItems : [ mediaItems ] )
			.filter(
				( mediaItem ) => getMediaItemType( mediaItem ) === 'image'
			)
			.map( ( mediaItem ) => mediaItem?.id )
			.filter( Boolean )
	),
];

/**
 * Resolves the post an attachment is currently attached to, reading only what
 * the picker already handed us.
 *
 * The two picker payload shapes name the parent differently, and both use a
 * distinct "no parent" value:
 *
 * - REST records (the DataViews modal, the inserter media categories) expose
 *   `post`, which is `null` — not `0` — when the attachment is unattached.
 * - The classic Backbone modal's `toJSON()` shape exposes `uploadedTo`, which
 *   is `0` when unattached.
 *
 * A *missing* key is not the same as an unattached item: it means the payload
 * never carried the parent, so we cannot tell. That distinction is what keeps
 * this from stealing attachments, so it is preserved rather than collapsed.
 *
 * There is deliberately no core-data fallback here. `select( coreStore )
 * .getEntityRecord()` triggers the resolver rather than passively reading
 * cache, so it would issue one REST request per selected item — the exact cost
 * this whole approach exists to avoid. Pickers that drop the parent are fixed
 * at the source instead (see `slimImageObject` in `@wordpress/media-utils`).
 *
 * @param {Object} mediaItem A media item from a picker's selection payload.
 *
 * @return {number|undefined} The parent post ID (`0` when unattached), or
 *                            `undefined` when the payload doesn't say.
 */
export function getAttachmentParent( mediaItem ) {
	if ( ! mediaItem || typeof mediaItem !== 'object' ) {
		return undefined;
	}

	if ( Object.hasOwn( mediaItem, 'post' ) ) {
		return normalizePostId( mediaItem.post ) ?? 0;
	}

	if ( Object.hasOwn( mediaItem, 'uploadedTo' ) ) {
		return normalizePostId( mediaItem.uploadedTo ) ?? 0;
	}

	return undefined;
}
