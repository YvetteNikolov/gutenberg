#!/bin/sh
#
# Run eval suites, following the jest/playwright convention: no arguments runs
# every suite, a leading path runs just that one, and any flags are passed
# through to promptfoo either way.
#
#   npm run eval
#   npm run eval -- suites/testing-skill-routing/promptfooconfig.yaml
#   npm run eval -- suites/testing-skill-routing/promptfooconfig.yaml --repeat 3
#   npm run eval -- --filter-providers claude
#
# A loop cannot live in the npm script itself: npm appends arguments to the
# script string rather than passing them as "$@", so anything after `done` is a
# shell syntax error.
set -e

PROMPTFOO_DISABLE_TELEMETRY=1
PROMPTFOO_FAILED_TEST_EXIT_CODE=0
export PROMPTFOO_DISABLE_TELEMETRY PROMPTFOO_FAILED_TEST_EXIT_CODE

# A first argument that does not start with `-` is a config path.
if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then
	config="$1"
	shift
	exec promptfoo eval --no-cache --config "$config" "$@"
fi

status=0
for config in suites/*/promptfooconfig.yaml; do
	[ -e "$config" ] || continue
	echo "── $config"
	promptfoo eval --no-cache --config "$config" "$@" || status=$?
done
exit $status
