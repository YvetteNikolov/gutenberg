/**
 * Custom promptfoo provider that runs a coding agent (Claude Code or Codex)
 * inside the Gutenberg checkout and captures its transcript.
 *
 * Beyond the final answer, it returns metadata the assertions use to verify
 * *process*, not just output:
 *   - `reads`:    files the agent opened with its Read tool (Claude only)
 *   - `commands`: shell commands the agent ran (both agents)
 *   - `denied`:   commands/tools the read-only guard refused
 *
 * The agent is never allowed to modify the checkout: Claude runs behind a
 * canUseTool guard that only permits read-only commands; Codex runs in its
 * built-in read-only sandbox.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evalsDir = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);

// Read-only commands the Claude agent may run. Each segment of a compound
// command must match, so `git show X && rm -rf .` is refused.
const READ_ONLY_COMMAND = /^\s*(git\s+(show|log|diff|status|rev-parse|branch|cat-file)\b|cat\s|ls\b|rg\s|grep\s|head\b|tail\b|wc\b|find\s|sed\s+-n\s|awk\s)/;

function isReadOnlyCommand( command ) {
	const segments = String( command )
		.split( /&&|\|\||;|\|/ )
		.map( ( segment ) => segment.trim() )
		.filter( Boolean );
	return (
		segments.length > 0 &&
		segments.every( ( segment ) => READ_ONLY_COMMAND.test( segment ) )
	);
}

async function runClaude( prompt, config ) {
	const { query } = await import( '@anthropic-ai/claude-agent-sdk' );
	const cwd = path.resolve( evalsDir, config.working_dir || '../../..' );
	const reads = [];
	const commands = [];
	const skillInvocations = [];
	const denied = [];
	let output = '';
	let numTurns;
	let totalCostUsd;

	const response = query( {
		prompt,
		options: {
			cwd,
			model: config.model || 'sonnet',
			settingSources: config.setting_sources ?? [ 'project' ],
			...( config.skills ? { skills: config.skills } : {} ),
			maxTurns: config.max_turns ?? 50,
			disallowedTools: [ 'Write', 'Edit', 'NotebookEdit', 'Task', 'WebFetch', 'WebSearch' ],
			canUseTool: async ( toolName, input ) => {
				if ( [ 'Read', 'Glob', 'Grep', 'Skill' ].includes( toolName ) ) {
					return { behavior: 'allow', updatedInput: input };
				}
				if ( toolName === 'Bash' && isReadOnlyCommand( input.command ) ) {
					return { behavior: 'allow', updatedInput: input };
				}
				denied.push( `${ toolName }: ${ input.command || input.file_path || '' }` );
				return {
					behavior: 'deny',
					message:
						'This is a read-only eval run. Only file reads and read-only git commands (show, log, diff, status) are allowed.',
				};
			},
		},
	} );

	for await ( const message of response ) {
		if ( message.type === 'assistant' ) {
			for ( const block of message.message?.content ?? [] ) {
				if ( block.type !== 'tool_use' ) {
					continue;
				}
				if ( block.name === 'Read' && block.input?.file_path ) {
					reads.push( block.input.file_path );
				} else if ( block.name === 'Bash' && block.input?.command ) {
					commands.push( block.input.command );
				} else if ( block.name === 'Skill' ) {
					skillInvocations.push( JSON.stringify( block.input ) );
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
			reads,
			commands,
			skillInvocations,
			denied,
			numTurns,
			totalCostUsd,
		},
	};
}

async function runCodex( prompt, config ) {
	const { Codex } = await import( '@openai/codex-sdk' );
	const cwd = path.resolve( evalsDir, config.working_dir || '../../..' );
	const commands = [];
	const fileChanges = [];
	let output = '';

	const codex = new Codex();
	const thread = codex.startThread( {
		workingDirectory: cwd,
		sandboxMode: 'read-only',
		skipGitRepoCheck: true,
		networkAccessEnabled: false,
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
			fileChanges.push( ...item.changes.map( ( change ) => change.path ) );
		} else if ( item.type === 'agent_message' ) {
			output = item.text;
		}
	}

	return {
		output,
		metadata: { agent: 'codex', reads: [], commands, fileChanges },
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
		try {
			return this.config.agent === 'codex'
				? await runCodex( prompt, this.config )
				: await runClaude( prompt, this.config );
		} catch ( error ) {
			return { error: String( error?.stack || error ) };
		}
	}
}
