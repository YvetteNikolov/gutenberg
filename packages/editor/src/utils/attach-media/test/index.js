/**
 * WordPress dependencies
 */
import { dispatch, select } from '@wordpress/data';

/**
 * Internal dependencies
 */
import {
	attachMediaToPost,
	clearPendingAttachments,
	flushPendingAttachments,
	getAttachablePostContext,
	getAttachmentParent,
} from '../';

jest.mock( '@wordpress/data', () => ( {
	select: jest.fn(),
	dispatch: jest.fn(),
} ) );

// The store descriptors are only used as lookup keys here, so stub them rather
// than booting the real stores (which would need the unmocked data module).
jest.mock( '../../../store', () => ( { store: 'core/editor' } ) );
jest.mock( '@wordpress/core-data', () => ( { store: 'core' } ) );

const IMAGE = { id: 7, media_type: 'image' };

function setupEditor( { postId = 42, status = 'publish', viewable = true } ) {
	select.mockImplementation( () => ( {
		getCurrentPostId: () => postId,
		getCurrentPostType: () => 'post',
		getCurrentPost: () => ( { status } ),
		getPostType: () => ( { viewable } ),
		getCachedResolvers: () => ( {} ),
	} ) );
}

let saveEntityRecord;
let batch;

beforeEach( () => {
	clearPendingAttachments();
	jest.clearAllMocks();

	saveEntityRecord = jest.fn( () => Promise.resolve( {} ) );
	batch = jest.fn( () => Promise.resolve( [] ) );
	dispatch.mockImplementation( () => ( {
		saveEntityRecord,
		__experimentalBatch: batch,
		invalidateResolution: jest.fn(),
	} ) );

	setupEditor( {} );
} );

describe( 'getAttachmentParent', () => {
	it( 'reads the parent from a REST payload', () => {
		expect( getAttachmentParent( { post: 12 } ) ).toBe( 12 );
	} );

	it( 'treats a null REST parent as unattached rather than unknown', () => {
		// REST reports an unattached item as `post: null`, not `post: 0`.
		expect( getAttachmentParent( { post: null } ) ).toBe( 0 );
	} );

	it( 'reads the parent from a classic Backbone payload', () => {
		expect( getAttachmentParent( { uploadedTo: 12 } ) ).toBe( 12 );
		expect( getAttachmentParent( { uploadedTo: 0 } ) ).toBe( 0 );
	} );

	it( 'returns undefined when the payload does not carry a parent', () => {
		expect( getAttachmentParent( { id: 7 } ) ).toBeUndefined();
		expect( getAttachmentParent( undefined ) ).toBeUndefined();
	} );
} );

describe( 'getAttachablePostContext', () => {
	it( 'rejects a non-viewable post type', () => {
		setupEditor( { viewable: false } );
		expect( getAttachablePostContext() ).toBeUndefined();
	} );

	it( 'rejects a non-numeric post ID', () => {
		setupEditor( { postId: 'my-template' } );
		expect( getAttachablePostContext() ).toBeUndefined();
	} );

	it.each( [ 'draft', 'pending', 'auto-draft', 'private', 'future' ] )(
		'does not consider %s publicly viewable',
		( status ) => {
			setupEditor( { status } );
			expect( getAttachablePostContext().isPubliclyViewable ).toBe(
				false
			);
		}
	);
} );

describe( 'attachMediaToPost', () => {
	it( 'attaches an unattached image to a published post', async () => {
		attachMediaToPost( { ...IMAGE, post: null } );
		await Promise.resolve();

		expect( saveEntityRecord ).toHaveBeenCalledWith(
			'postType',
			'attachment',
			{ id: 7, post: 42 },
			{ throwOnError: true }
		);
	} );

	it( 'never steals an image already attached to another post', async () => {
		attachMediaToPost( { ...IMAGE, post: 99 } );
		await Promise.resolve();

		expect( saveEntityRecord ).not.toHaveBeenCalled();
		expect( batch ).not.toHaveBeenCalled();
	} );

	it( 'skips an image whose parent the payload does not report', async () => {
		attachMediaToPost( IMAGE );
		await Promise.resolve();

		expect( saveEntityRecord ).not.toHaveBeenCalled();
	} );

	it( 'skips non-image media', async () => {
		attachMediaToPost( { id: 7, media_type: 'file', post: null } );
		await Promise.resolve();

		expect( saveEntityRecord ).not.toHaveBeenCalled();
	} );

	it( 'batches a multi-item selection into one request', async () => {
		attachMediaToPost( [
			{ id: 1, media_type: 'image', post: null },
			{ id: 2, media_type: 'image', post: null },
			{ id: 3, media_type: 'image', post: null },
		] );
		await Promise.resolve();

		expect( batch ).toHaveBeenCalledTimes( 1 );
		expect( saveEntityRecord ).not.toHaveBeenCalled();
	} );

	it( 'does nothing when the post type is not attachable', async () => {
		setupEditor( { viewable: false } );
		attachMediaToPost( { ...IMAGE, post: null } );
		await Promise.resolve();

		expect( saveEntityRecord ).not.toHaveBeenCalled();
	} );

	it( 'swallows a failed write and warns with the error as its own argument', async () => {
		const error = { code: 'rest_cannot_edit', message: 'Nope' };
		saveEntityRecord.mockRejectedValueOnce( error );
		const warn = jest
			.spyOn( window.console, 'warn' )
			.mockImplementation( () => {} );

		await expect(
			( async () => attachMediaToPost( { ...IMAGE, post: null } ) )()
		).resolves.toBeUndefined();
		// Let the fire-and-forget write settle.
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

		expect( warn ).toHaveBeenCalledWith(
			'Could not attach media to the post.',
			error
		);
		warn.mockRestore();
	} );
} );

describe( 'deferring until the post is publicly viewable', () => {
	it( 'buffers instead of writing while the post is a draft', async () => {
		setupEditor( { status: 'draft' } );
		attachMediaToPost( { ...IMAGE, post: null } );
		await Promise.resolve();

		expect( saveEntityRecord ).not.toHaveBeenCalled();
	} );

	it( 'writes the buffered images once flushed', async () => {
		setupEditor( { status: 'draft' } );
		attachMediaToPost( { ...IMAGE, post: null } );

		await flushPendingAttachments( 42 );

		expect( saveEntityRecord ).toHaveBeenCalledWith(
			'postType',
			'attachment',
			{ id: 7, post: 42 },
			{ throwOnError: true }
		);
	} );

	it( 'is idempotent on a second flush', async () => {
		setupEditor( { status: 'draft' } );
		attachMediaToPost( { ...IMAGE, post: null } );

		await flushPendingAttachments( 42 );
		await flushPendingAttachments( 42 );

		expect( saveEntityRecord ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'deduplicates repeat selections of the same image', async () => {
		setupEditor( { status: 'draft' } );
		attachMediaToPost( { ...IMAGE, post: null } );
		attachMediaToPost( { ...IMAGE, post: null } );

		await flushPendingAttachments( 42 );

		expect( saveEntityRecord ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'keeps each post’s buffer separate', async () => {
		setupEditor( { status: 'draft', postId: 1 } );
		attachMediaToPost( { ...IMAGE, post: null } );

		await flushPendingAttachments( 2 );

		expect( saveEntityRecord ).not.toHaveBeenCalled();
	} );
} );
