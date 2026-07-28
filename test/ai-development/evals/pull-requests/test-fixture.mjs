/* eslint-disable no-console */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFixtureRepository } from './fixture-repo.mjs';

const evalsDir = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const sourceRoot = path.resolve( evalsDir, '../../..' );
const targetCommit = '1f27df2962c8f459582eeb41435251713f30c810';

const cases = [
	{
		name: 'candidate fixture contains the skill but not the eval answer fixtures',
		guidance: 'candidate',
		hasSkill: true,
	},
	{
		name: 'control fixture omits the skill and eval answer fixtures',
		guidance: 'control',
		hasSkill: false,
	},
];

for ( const testCase of cases ) {
	const fixture = await createFixtureRepository( {
		sourceRoot,
		targetCommit,
		guidance: testCase.guidance,
	} );
	try {
		const skillPath = path.join(
			fixture.cwd,
			'skills',
			'pull-requests',
			'SKILL.md'
		);
		const evalFixturePath = path.join(
			fixture.cwd,
			'test',
			'ai-development',
			'evals',
			'pull-requests',
			'fixtures',
			'good.md'
		);
		const hasSkill = await fs
			.access( skillPath )
			.then( () => true )
			.catch( () => false );
		const hasEvalFixture = await fs
			.access( evalFixturePath )
			.then( () => true )
			.catch( () => false );
		const agents = await fs.readFile(
			path.join( fixture.cwd, 'AGENTS.md' ),
			'utf8'
		);
		const claude = await fs.readFile(
			path.join( fixture.cwd, 'CLAUDE.md' ),
			'utf8'
		);

		assert.equal( hasSkill, testCase.hasSkill );
		assert.equal( hasEvalFixture, false );
		assert.equal( claude, '@AGENTS.md\n' );
		assert.equal(
			agents.includes( 'skills/pull-requests/SKILL.md' ),
			testCase.hasSkill
		);

		console.log( `PASS  ${ testCase.name }` );
	} finally {
		await fixture.cleanup();
	}
}
/* eslint-enable no-console */
