/**
 * Deterministic artifact grading for this suite.
 */
import {
	getAddedDiffLines,
	parseWorkspaceArtifact,
} from '../../lib/workspace-artifact.mjs';

function grade( pass, reason ) {
	return { pass, score: pass ? 1 : 0, reason };
}

const e2eSpecPattern = /^test\/e2e\/specs\/.+\.spec\.(?:js|ts)$/;

export function changedE2eSpec( output ) {
	const { changedFiles } = parseWorkspaceArtifact( output );
	const specs = changedFiles.filter( ( file ) =>
		e2eSpecPattern.test( file )
	);
	return grade(
		specs.length > 0,
		specs.length > 0
			? `Changed E2E spec: ${ specs.join( ', ' ) }`
			: 'No E2E spec was changed.'
	);
}

export function changedOnlyE2eTests( output ) {
	const { changedFiles } = parseWorkspaceArtifact( output );
	const unrelated = changedFiles.filter(
		( file ) => ! file.startsWith( 'test/e2e/' )
	);
	return grade(
		changedFiles.length > 0 && unrelated.length === 0,
		unrelated.length === 0
			? 'All changed files are under test/e2e/.'
			: `Changed files outside test/e2e/: ${ unrelated.join( ', ' ) }`
	);
}

export function usedAccessibleParagraphLocator( output ) {
	const additions = getAddedDiffLines(
		parseWorkspaceArtifact( output ).diff
	);
	const hasLocator =
		/editor\s*\.\s*canvas\s*\.\s*getByRole\s*\(\s*(['"])document\1\s*,\s*\{[\s\S]{0,300}?name\s*:\s*(['"])Block:\s*Paragraph\2[\s\S]{0,100}?\}\s*\)/.test(
			additions
		);
	return grade(
		hasLocator,
		hasLocator
			? 'The test finds the paragraph with the documented accessible canvas locator.'
			: "No added locator uses editor.canvas.getByRole( 'document', { name: 'Block: Paragraph' } )."
	);
}

export function enteredLiteralAmpersand( output ) {
	const additions = getAddedDiffLines(
		parseWorkspaceArtifact( output ).diff
	);
	const hasInput =
		/(?:fill|type|pressSequentially|insertText)\s*\(\s*(['"`])&\1/.test(
			additions
		);
	return grade(
		hasInput,
		hasInput
			? 'The test enters a literal ampersand through an input API.'
			: 'No added input action enters a literal ampersand.'
	);
}

export function assertedUnencodedAmpersand( output ) {
	const additions = getAddedDiffLines(
		parseWorkspaceArtifact( output ).diff
	);
	const assertsRawAmpersand =
		/(?:toBe|toEqual|toContain|toHaveText|toMatch|toMatchObject)\s*\([\s\S]{0,800}?(['"`])&(?!amp;)\1/.test(
			additions
		);
	const rejectsEncodedAmpersand =
		/\.not\s*\.\s*(?:toBe|toEqual|toContain|toHaveText|toMatch|toMatchObject)\s*\([\s\S]{0,800}?(['"`])&amp;\1/.test(
			additions
		);

	return grade(
		assertsRawAmpersand || rejectsEncodedAmpersand,
		assertsRawAmpersand || rejectsEncodedAmpersand
			? 'The test distinguishes a literal ampersand from encoded content.'
			: 'No added assertion checks the literal or encoded ampersand result.'
	);
}
