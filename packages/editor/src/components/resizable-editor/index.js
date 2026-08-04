/**
 * External dependencies
 */
import clsx from 'clsx';

/**
 * WordPress dependencies
 */
import { useDispatch, useSelect } from '@wordpress/data';
import { useRef, useCallback, useState } from '@wordpress/element';
import { ResizableBox } from '@wordpress/components';
import { store as blockEditorStore } from '@wordpress/block-editor';

/**
 * Internal dependencies
 */
import ResizeHandle from './resize-handle';
import { store as editorStore } from '../../store';
import { getDeviceTypeByCanvasWidth } from '../../utils/device-type';
import { unlock } from '../../lock-unlock';

// Removes the inline styles in the drag handles.
const HANDLE_STYLES_OVERRIDE = {
	position: undefined,
	userSelect: undefined,
	cursor: undefined,
	width: undefined,
	height: undefined,
	top: undefined,
	right: undefined,
	bottom: undefined,
	left: undefined,
};

/**
 * Checks if the current width is at the max width.
 *
 * @param {number} currentWidth   - The current width of the editor.
 * @param {number} containerWidth - The width of the container.
 * @param {number} tolerance      - The tolerance for the max width in pixels.
 * @return {boolean} - True if the current width is at the max width, false otherwise.
 */
function isAtMaxWidth( currentWidth, containerWidth, tolerance = 0 ) {
	return containerWidth > 0 && currentWidth >= containerWidth - tolerance;
}

/**
 * Returns the canvas width to store, or `undefined` to keep the canvas fluid.
 *
 * @param {number} currentWidth   - The current width of the editor.
 * @param {number} containerWidth - The width of the container.
 * @return {number|undefined} - The canvas width, or undefined when fluid.
 */
function getCanvasWidthForSize( currentWidth, containerWidth ) {
	return isAtMaxWidth( currentWidth, containerWidth, 80 )
		? undefined
		: currentWidth;
}

/**
 * Returns a signature of what the editor renders from the canvas width: whether
 * the canvas is fluid, and the device type driving the preview dropdown icon.
 *
 * @param {number|undefined} canvasWidth      - The canvas width.
 * @param {Object|undefined} viewportSettings - The viewport breakpoint settings.
 * @return {string} - The signature.
 */
function getCanvasWidthSignature( canvasWidth, viewportSettings ) {
	return `${ canvasWidth === undefined }|${ getDeviceTypeByCanvasWidth(
		canvasWidth,
		viewportSettings
	) }`;
}

function ResizableEditor( {
	className,
	enableResizing,
	width = '100%',
	height = '100%',
	onResizeStart,
	onResizeStop,
	children,
} ) {
	const [ isResizing, setIsResizing ] = useState( false );
	const { setCanvasWidth } = unlock( useDispatch( editorStore ) );
	const { getSettings } = useSelect( blockEditorStore );

	const resizableRef = useRef();
	const gestureRef = useRef();

	const resizeWidthBy = useCallback(
		( deltaPixels ) => {
			if ( resizableRef.current ) {
				setCanvasWidth(
					getCanvasWidthForSize(
						resizableRef.current.offsetWidth + deltaPixels,
						resizableRef.current.parentElement?.offsetWidth ?? 0
					)
				);
			}
		},
		[ setCanvasWidth ]
	);

	const handleResizeStart = ( event, direction, element ) => {
		const startWidth = element.offsetWidth;
		const containerWidth = element.parentElement?.offsetWidth ?? 0;
		const viewportSettings = getSettings().__experimentalFeatures?.viewport;
		gestureRef.current = {
			startWidth,
			containerWidth,
			viewportSettings,
			signature: getCanvasWidthSignature(
				getCanvasWidthForSize( startWidth, containerWidth ),
				viewportSettings
			),
		};
		setIsResizing( true );
		onResizeStart?.();
	};

	// `re-resizable` sizes the canvas itself while dragging, so only update the
	// store when something observable changes. Dispatching on every pointer
	// move would re-render the whole canvas for each frame of the drag.
	const handleResize = ( event, direction, element, delta ) => {
		const gesture = gestureRef.current;

		if ( ! gesture ) {
			return;
		}

		const canvasWidth = getCanvasWidthForSize(
			gesture.startWidth + delta.width,
			gesture.containerWidth
		);
		const signature = getCanvasWidthSignature(
			canvasWidth,
			gesture.viewportSettings
		);

		if ( signature === gesture.signature ) {
			return;
		}

		gesture.signature = signature;
		setCanvasWidth( canvasWidth );
	};

	const handleResizeStop = ( event, direction, element, delta ) => {
		const gesture = gestureRef.current;

		if ( gesture ) {
			// Commit the exact width the gesture ended on.
			setCanvasWidth(
				getCanvasWidthForSize(
					gesture.startWidth + delta.width,
					gesture.containerWidth
				)
			);
			gestureRef.current = undefined;
		}

		setIsResizing( false );
		onResizeStop?.();
	};

	return (
		<ResizableBox
			className={ clsx( 'editor-resizable-editor', className, {
				'is-resizable': enableResizing,
				'is-resizing': isResizing,
			} ) }
			ref={ ( api ) => {
				resizableRef.current = api?.resizable;
			} }
			size={ {
				width,
				height,
			} }
			onResizeStart={ handleResizeStart }
			onResize={ handleResize }
			onResizeStop={ handleResizeStop }
			minWidth={ 300 }
			maxWidth="100%"
			maxHeight="100%"
			enable={ {
				left: enableResizing,
				right: enableResizing,
			} }
			showHandle={ enableResizing }
			// The editor is centered horizontally, resizing it only
			// moves half the distance. Hence double the ratio to correctly
			// align the cursor to the resizer handle.
			resizeRatio={ 2 }
			handleComponent={ {
				left: (
					<ResizeHandle
						direction="left"
						resizeWidthBy={ resizeWidthBy }
					/>
				),
				right: (
					<ResizeHandle
						direction="right"
						resizeWidthBy={ resizeWidthBy }
					/>
				),
			} }
			handleClasses={ undefined }
			handleStyles={ {
				left: HANDLE_STYLES_OVERRIDE,
				right: HANDLE_STYLES_OVERRIDE,
			} }
		>
			{ children }
		</ResizableBox>
	);
}

export default ResizableEditor;
