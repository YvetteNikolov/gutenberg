/**
 * Runs a coding agent against a disposable Gutenberg fixture.
 *
 * This provider owns exactly one thing promptfoo cannot know about: the
 * throwaway repository the agent works in. Everything else — invoking the
 * agent, capturing its tool calls, normalising them across vendors — is
 * delegated to promptfoo's built-in agent providers, which populate
 * `metadata.toolCalls` and `metadata.skillCalls` in a shape the `skill-used`
 * and `trajectory:*` assertions understand.
 *
 * Config:
 *   provider         Native promptfoo provider id, e.g. `anthropic:claude-code`
 *                    or `openai:codex-sdk`.
 *   provider_config  Passed through to that provider. `working_dir` is set by
 *                    this wrapper and cannot be overridden.
 *   fixture_module   Path of a module exporting `createFixtureRepository`,
 *                    resolved relative to the config file that names it.
 *   fixture_commit   Optional commit override for the fixture module.
 *   fixture_options  Optional extra options forwarded to the fixture module,
 *                    for targets that build more than one variant.
 *
 * Subject agents may modify the fixture, which is deleted after the run. The
 * developer's checkout is never used as the subject working directory.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const libDir = path.dirname( fileURLToPath( import.meta.url ) );
const sourceRoot = path.resolve( libDir, '../../../..' );

/**
 * Loads a suite's fixture module.
 *
 * `basePath` is the directory of the config that declared this provider, so a
 * suite refers to its own fixture by bare filename and stays self-contained.
 *
 * @param {string} fixtureModule Path from `fixture_module`.
 * @param {string} basePath      Directory of the declaring config.
 * @return {Promise<Object>} The loaded module.
 */
async function loadFixtureModule( fixtureModule, basePath ) {
	if ( ! fixtureModule ) {
		throw new Error( 'fixture_module is required' );
	}

	const modulePath = path.resolve( basePath || libDir, fixtureModule );
	const loaded = await import( pathToFileURL( modulePath ).href );

	if ( typeof loaded.createFixtureRepository !== 'function' ) {
		throw new Error(
			`${ fixtureModule } must export createFixtureRepository`
		);
	}

	return loaded;
}

/**
 * Confines the Claude sandbox to the fixture.
 *
 * `sandbox` is the one config key promptfoo forwards to the Claude Agent SDK
 * verbatim, and its filesystem allowlists need an absolute path that only
 * exists at run time. The config declares the policy; this fills in the path.
 * Providers with no `sandbox` block (Codex uses `sandbox_mode`) pass through
 * untouched.
 *
 * @param {Object} providerConfig Config destined for the native provider.
 * @param {string} cwd            Fixture working directory.
 * @return {Object} Config with fixture-scoped filesystem allowlists.
 */
function withFixturePaths( providerConfig, cwd ) {
	if ( ! providerConfig.sandbox ) {
		return providerConfig;
	}

	return {
		...providerConfig,
		sandbox: {
			...providerConfig.sandbox,
			filesystem: {
				...( providerConfig.sandbox.filesystem || {} ),
				allowRead: [ cwd ],
				allowWrite: [ cwd ],
			},
		},
	};
}

export default class GutenbergAgentProvider {
	/**
	 * @param {Object}   [options]                 Provider options from promptfoo.
	 * @param {Object}   [options.config]          Provider config block.
	 * @param {string}   [options.id]              Explicit provider id.
	 * @param {string}   [options.label]           Display label.
	 * @param {Function} [options.loadApiProvider] Injection seam for tests; defaults to
	 *                                             promptfoo's own provider loader.
	 */
	constructor( options = {} ) {
		this.config = options.config || {};
		this.label = options.label;
		this.providerId =
			options.id ||
			`gutenberg-agent:${ this.config.provider || 'unconfigured' }`;
		this.loadApiProvider = options.loadApiProvider;
		// promptfoo injects the declaring config's directory here.
		this.basePath = this.config.basePath;
	}

	id() {
		return this.providerId;
	}

	async delegate() {
		if ( ! this.config.provider ) {
			throw new Error(
				'config.provider is required (e.g. `anthropic:claude-code`)'
			);
		}

		// Imported lazily so this module stays loadable for the fixture tests,
		// which never touch promptfoo.
		const load =
			this.loadApiProvider ||
			( await import( 'promptfoo' ) ).default.loadApiProvider;

		return load;
	}

	async callApi( prompt, context, options ) {
		let fixture;

		try {
			const load = await this.delegate();
			const { createFixtureRepository } = await loadFixtureModule(
				this.config.fixture_module,
				this.basePath
			);

			fixture = await createFixtureRepository( {
				sourceRoot,
				targetCommit: this.config.fixture_commit,
				...( this.config.fixture_options || {} ),
			} );

			const agent = await load( this.config.provider, {
				options: {
					config: {
						...withFixturePaths(
							this.config.provider_config || {},
							fixture.cwd
						),
						working_dir: fixture.cwd,
					},
				},
			} );

			const response = await agent.callApi( prompt, context, options );

			return {
				...response,
				metadata: {
					...( response.metadata || {} ),
					// Which throwaway repository the run actually saw, so a
					// surprising result can be traced back to its fixture.
					fixtureCommit: fixture.fixtureCommit,
				},
			};
		} catch ( error ) {
			return { error: String( error?.stack || error ) };
		} finally {
			await fixture?.cleanup();
		}
	}
}
