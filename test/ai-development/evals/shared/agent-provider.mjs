/**
 * Custom promptfoo provider that runs a coding agent (Claude Code or Codex)
 * inside a disposable Gutenberg fixture and captures its transcript.
 *
 * Beyond the final answer, it returns metadata the assertions use to verify
 * *process*, not just output:
 *   - `reads`:    files the agent opened with its Read tool (Claude only)
 *   - `commands`: shell commands the agent ran (both agents)
 *   - `denied`:   tools the sandbox policy refused
 *
 * Subject agents may modify the disposable fixture, which is deleted after the
 * run. Network access is disabled and the developer's checkout is never used as
 * the subject working directory.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const evalsDir = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const sourceRoot = path.resolve( evalsDir, '../../..' );

async function createSubjectFixture( config ) {
	if ( ! config.fixture_module ) {
		throw new Error( 'fixture_module is required for subject providers' );
	}

	const fixtureModulePath = path.resolve( evalsDir, config.fixture_module );
	const fixtureModule = await import(
		pathToFileURL( fixtureModulePath ).href
	);
	if ( typeof fixtureModule.createFixtureRepository !== 'function' ) {
		throw new Error(
			`${ config.fixture_module } must export createFixtureRepository`
		);
	}

	return fixtureModule.createFixtureRepository( {
		sourceRoot,
		targetCommit: config.fixture_commit,
		guidance: config.guidance,
	} );
}

function subjectEnvironment() {
	const allowed = [
		'ANTHROPIC_API_KEY',
		'CLAUDE_CODE_OAUTH_TOKEN',
		'CODEX_API_KEY',
		'HOME',
		'LANG',
		'LC_ALL',
		'OPENAI_API_KEY',
		'PATH',
		'SHELL',
		'TERM',
		'TMPDIR',
		'USER',
	];
	return Object.fromEntries(
		allowed
			.filter( ( name ) => process.env[ name ] !== undefined )
			.map( ( name ) => [ name, process.env[ name ] ] )
	);
}

async function runClaude( prompt, config ) {
	const { query } = await import( '@anthropic-ai/claude-agent-sdk' );
	const cwd = config.cwd;
	const reads = [];
	const commands = [];
	const denied = [];
	let output = '';
	let numTurns;
	let totalCostUsd;
	let model;

	const judge = config.role === 'judge';

	const response = query( {
		prompt,
		options: {
			cwd,
			model: config.model || 'sonnet',
			settingSources: judge
				? []
				: config.setting_sources ?? [ 'project' ],
			skills: [],
			tools: judge ? [] : [ 'Bash', 'Read', 'Glob', 'Grep' ],
			maxTurns: judge ? 1 : config.max_turns ?? 50,
			disallowedTools: [
				'Write',
				'Edit',
				'NotebookEdit',
				'Task',
				'WebFetch',
				'WebSearch',
			],
			env: subjectEnvironment(),
			sandbox: judge
				? undefined
				: {
						enabled: true,
						failIfUnavailable: true,
						autoAllowBashIfSandboxed: true,
						allowUnsandboxedCommands: false,
						network: {
							allowedDomains: [],
							strictAllowlist: true,
						},
						filesystem: {
							allowManagedReadPathsOnly: true,
							allowRead: [ cwd ],
							allowWrite: [ cwd ],
						},
				  },
			canUseTool: async ( toolName, input ) => {
				if ( [ 'Read', 'Glob', 'Grep', 'Bash' ].includes( toolName ) ) {
					return { behavior: 'allow', updatedInput: input };
				}
				denied.push(
					`${ toolName }: ${ input.command || input.file_path || '' }`
				);
				return {
					behavior: 'deny',
					message:
						'This tool is not available in the isolated eval environment.',
				};
			},
		},
	} );

	for await ( const message of response ) {
		if ( message.type === 'assistant' ) {
			model = message.message?.model || model;
			for ( const block of message.message?.content ?? [] ) {
				if ( block.type !== 'tool_use' ) {
					continue;
				}
				if ( block.name === 'Read' && block.input?.file_path ) {
					reads.push( block.input.file_path );
				} else if ( block.name === 'Bash' && block.input?.command ) {
					commands.push( block.input.command );
				}
			}
		} else if ( message.type === 'result' ) {
			numTurns = message.num_turns;
			totalCostUsd = message.total_cost_usd;
			output =
				message.subtype === 'success'
					? message.result
					: `[agent error: ${ message.subtype }]`;
		}
	}

	return {
		output,
		metadata: {
			agent: 'claude',
			model,
			reads,
			commands,
			denied,
			numTurns,
			totalCostUsd,
		},
	};
}

async function runCodex( prompt, config ) {
	const { Codex } = await import( '@openai/codex-sdk' );
	const cwd = config.cwd;
	const commands = [];
	const fileChanges = [];
	let output = '';

	const codex = new Codex( { env: subjectEnvironment() } );
	const thread = codex.startThread( {
		workingDirectory: cwd,
		sandboxMode: 'workspace-write',
		skipGitRepoCheck: true,
		networkAccessEnabled: false,
		webSearchMode: 'disabled',
		approvalPolicy: 'never',
		...( config.model ? { model: config.model } : {} ),
	} );

	const { events } = await thread.runStreamed( prompt );
	for await ( const event of events ) {
		if ( event.type !== 'item.completed' ) {
			continue;
		}
		const item = event.item;
		if ( item.type === 'command_execution' ) {
			commands.push( item.command );
		} else if ( item.type === 'file_change' ) {
			fileChanges.push(
				...item.changes.map( ( change ) => change.path )
			);
		} else if ( item.type === 'agent_message' ) {
			output = item.text;
		}
	}

	return {
		output,
		metadata: {
			agent: 'codex',
			model: config.model || 'cli-default',
			reads: [],
			commands,
			fileChanges,
		},
	};
}

export default class GutenbergAgentProvider {
	constructor( options = {} ) {
		this.config = options.config || {};
		this.providerId =
			options.id || `gutenberg-agent:${ this.config.agent || 'claude' }`;
	}

	id() {
		return this.providerId;
	}

	async callApi( prompt ) {
		let fixture;
		try {
			if ( this.config.role === 'judge' ) {
				const judgeRoot = await fs.mkdtemp(
					path.join( os.tmpdir(), 'gutenberg-agent-judge-' )
				);
				fixture = {
					cwd: judgeRoot,
					cleanup: () =>
						fs.rm( judgeRoot, {
							recursive: true,
							force: true,
						} ),
				};
			} else {
				fixture = await createSubjectFixture( this.config );
			}

			const response =
				this.config.agent === 'codex'
					? await runCodex( prompt, {
							...this.config,
							cwd: fixture.cwd,
					  } )
					: await runClaude( prompt, {
							...this.config,
							cwd: fixture.cwd,
					  } );
			response.metadata = {
				...response.metadata,
				evaluation: this.config.evaluation,
				guidance: fixture.guidance,
				fixtureCommit: fixture.fixtureCommit,
			};
			return response;
		} catch ( error ) {
			return { error: String( error?.stack || error ) };
		} finally {
			await fixture?.cleanup();
		}
	}
}
