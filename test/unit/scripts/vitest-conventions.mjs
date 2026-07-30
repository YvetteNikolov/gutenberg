export function hasTestEnvironmentOverride( source ) {
	return /@(?:vitest|jest)-environment(?:\s|$)/m.test( source );
}
