export function hasTestEnvironmentOverride( source ) {
	return /@vitest-environment(?:\s|$)/m.test( source );
}

export function hasBrowserModeImport( source ) {
	return /(?:from\s+|import\s*)[('"](?:vitest\/browser|vitest-browser-react)/.test(
		source
	);
}
