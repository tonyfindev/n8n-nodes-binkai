import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	INodeInputConfiguration,
	INodeInputFilter,
	INodeProperties,
	NodeOperationError,
	jsonParse,
	NodeConnectionType,
} from 'n8n-workflow';
import { textInput } from '../../utils/descriptions';
import {
	getOptionalOutputParser,
	N8nOutputParser,
} from '../../utils/output_parsers/N8nOutputParser';
import { getPromptInputByType } from '../../utils/helpers';
import { getChatModel, getOptionalMemory, getTools } from '../../utils/common';
import { ToolName } from '../../utils/toolName';
import type { BaseChatMemory } from '@langchain/community/memory/chat_memory';
import { Wallet, Network } from '@binkai/core';
import { ethers } from 'ethers';
import { SwapPlugin } from '@binkai/swap-plugin';
import { TokenPlugin } from '@binkai/token-plugin';
import { WalletPlugin } from '@binkai/wallet-plugin';
import { JupiterProvider } from '@binkai/jupiter-provider';
import { KyberProvider } from '@binkai/kyber-provider';
import { AlchemyProvider } from '@binkai/alchemy-provider';
import { N8nLLM } from '../N8NBase/N8nLLM';
import { omit } from 'lodash';
import { N8nBinkAgent } from '../N8NBase/N8nBinkAgent';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { deBridgeProvider } from '@binkai/debridge-provider';
import { Connection } from '@solana/web3.js';
import { BridgePlugin } from '@binkai/bridge-plugin';
// import { TransferPlugin } from '@binkai/transfer-plugin';
import { BirdeyeProvider } from '@binkai/birdeye-provider';
import { SYSTEM_MESSAGE } from '../../utils/prompt';
import { planAndExecuteAgentProperties } from '../../utils/descriptions';
import { getNetworksConfig, SupportChain } from '../../utils/networks';

function getInputs(
	agent:
		| 'toolsAgent'
		| 'conversationalAgent'
		| 'openAiFunctionsAgent'
		| 'planAndExecuteAgent'
		| 'reActAgent',
	hasOutputParser?: boolean,
): Array<NodeConnectionType | INodeInputConfiguration> {
	interface SpecialInput {
		type: NodeConnectionType;
		filter?: INodeInputFilter;
		required?: boolean;
	}

	const getInputData = (
		inputs: SpecialInput[],
	): Array<NodeConnectionType | INodeInputConfiguration> => {
		const displayNames: { [key: string]: string } = {
			ai_languageModel: 'Model',
			ai_memory: 'Memory',
			ai_tool: 'Tool',
			ai_outputParser: 'Output Parser',
		};

		return inputs.map(({ type, filter }) => {
			const isModelType = type === ('ai_languageModel' as NodeConnectionType);
			let displayName = type in displayNames ? displayNames[type] : undefined;
			if (
				isModelType &&
				['openAiFunctionsAgent', 'toolsAgent', 'conversationalAgent'].includes(agent)
			) {
				displayName = 'Chat Model';
			}
			const input: INodeInputConfiguration = {
				type,
				displayName,
				required: isModelType,
				maxConnections: ['ai_languageModel', 'ai_memory', 'ai_outputParser'].includes(
					type as NodeConnectionType,
				)
					? 1
					: undefined,
			};

			if (filter) {
				input.filter = filter;
			}

			return input;
		});
	};

	let specialInputs: SpecialInput[] = [];

	if (agent === 'toolsAgent') {
		specialInputs = [
			{
				type: 'ai_languageModel' as NodeConnectionType,
				filter: {
					nodes: [
						'@n8n/n8n-nodes-langchain.lmChatAnthropic',
						'@n8n/n8n-nodes-langchain.lmChatAzureOpenAi',
						'@n8n/n8n-nodes-langchain.lmChatAwsBedrock',
						'@n8n/n8n-nodes-langchain.lmChatMistralCloud',
						'@n8n/n8n-nodes-langchain.lmChatOllama',
						'@n8n/n8n-nodes-langchain.lmChatOpenAi',
						'@n8n/n8n-nodes-langchain.lmChatGroq',
						'@n8n/n8n-nodes-langchain.lmChatGoogleVertex',
						'@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
						'@n8n/n8n-nodes-langchain.lmChatDeepSeek',
						'@n8n/n8n-nodes-langchain.lmChatOpenRouter',
						'@n8n/n8n-nodes-langchain.lmChatXAiGrok',
					],
				},
			},
			{
				type: 'ai_memory' as NodeConnectionType,
			},
			{
				type: 'ai_tool' as NodeConnectionType,
				required: true,
			},
			{
				type: 'ai_outputParser' as NodeConnectionType,
			},
		];
	}

	if (hasOutputParser === false) {
		specialInputs = specialInputs.filter((input) => input.type !== 'ai_outputParser');
	}
	return ['main', ...getInputData(specialInputs)] as Array<
		NodeConnectionType | INodeInputConfiguration
	>;
}

const agentTypeProperty: INodeProperties = {
	displayName: 'Agent',
	name: 'agent',
	type: 'options',
	noDataExpression: true,
	// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
	options: [
		{
			name: 'Tools Agent',
			value: 'toolsAgent',
			description:
				'Utilizes structured tool schemas for precise and reliable tool selection and execution. Recommended for complex tasks requiring accurate and consistent tool usage, but only usable with models that support tool calling.',
		},
	],
	default: 'toolsAgent',
};

export const promptTypeOptions: INodeProperties = {
	displayName: 'Source for Prompt (User Message)',
	name: 'promptType',
	type: 'options',
	options: [
		{
			name: 'Connected Chat Trigger Node',
			value: 'auto',
			description:
				"Looks for an input field called 'chatInput' that is coming from a directly connected Chat Trigger",
		},
		{
			name: 'Define Below',
			value: 'define',
			description: 'Use an expression to reference data in previous nodes or enter static text',
		},
	],
	default: 'auto',
};

export const toolsAgentProperties: INodeProperties[] = [
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		displayOptions: {
			show: {
				agent: ['toolsAgent'],
			},
		},
		default: {},
		placeholder: 'Add Option',
		options: [
			{
				displayName: 'System Message',
				name: 'systemMessage',
				type: 'string',
				default: SYSTEM_MESSAGE,
				description: 'The message that will be sent to the agent before the conversation starts',
				typeOptions: {
					rows: 6,
				},
			},
			{
				displayName: 'Max Iterations',
				name: 'maxIterations',
				type: 'number',
				default: 10,
				description: 'The maximum number of iterations the agent will run before stopping',
			},
			{
				displayName: 'Return Intermediate Steps',
				name: 'returnIntermediateSteps',
				type: 'boolean',
				default: false,
				description: 'Whether or not the output should include intermediate steps the agent took',
			},
			{
				displayName: 'Automatically Passthrough Binary Images',
				name: 'passthroughBinaryImages',
				type: 'boolean',
				default: true,
				description:
					'Whether or not binary images should be automatically passed through to the agent as image type messages',
			},
		],
	},
];

export class BinkAgentNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Bink AI Agent',
		name: 'binkAgentNode',
		group: ['transform'],
		version: 1,
		icon: 'fa:robot',
		iconColor: 'black',
		description: 'Initialize Bink AI Agent with plugins',
		defaults: {
			name: 'Bink AI Agent',
		},
		inputs: `={{
			((agent, hasOutputParser) => {
				${getInputs.toString()};
				return getInputs(agent, hasOutputParser)
			})($parameter.agent, $parameter.hasOutputParser === undefined || $parameter.hasOutputParser === true)
		}}`,
		outputs: ['main' as NodeConnectionType] as any,
		properties: [
			{
				displayName:
					'Tip: Get a feel for agents with our quick <a href="https://docs.n8n.io/advanced-ai/intro-tutorial/" target="_blank">tutorial</a> or see an <a href="/templates/1954" target="_blank">example</a> of how this node works',
				name: 'notice_tip',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						agent: ['toolsAgent'],
					},
				},
			},

			{
				displayName: 'Require Specific Output Format',
				name: 'hasOutputParser',
				type: 'boolean',
				default: false,
				noDataExpression: true,
			},
			{
				displayName: `Connect an <a data-action='openSelectiveNodeCreator' data-action-parameter-connectiontype='${NodeConnectionType.AiOutputParser}'>output parser</a> on the canvas to specify the output format you require`,
				name: 'notice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						hasOutputParser: [true],
						agent: ['toolsAgent'],
					},
				},
			},
			
			...[promptTypeOptions],
			// ...[textFromPreviousNode],
			...[textInput],
			...[agentTypeProperty],
			...toolsAgentProperties,
			...planAndExecuteAgentProperties,
		],
		credentials: [
			{
				name: 'binkaiCredentialsApi',
				required: true,
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const typeAgent = this.getNodeParameter('agent', 0) as string;
		const returnData: INodeExecutionData[] = [];
		const items = this.getInputData();
		const outputParser = (await getOptionalOutputParser(this)) as N8nOutputParser;
		const tools = (await getTools(this, outputParser)) as DynamicStructuredTool[];

		// Get credentials
		const baseCredentials = await this.getCredentials('binkaiCredentialsApi');
		const walletCredentials = await this.getCredentials('binkWalletCredentials');
		const tokenCredentials = await this.getCredentials('binkaiTokenCredentials');

		// Get RPC URLs from credentials
		const RPC_URLS = {
			BNB: baseCredentials.bnbRpcUrl as string,
			ETH: baseCredentials.ethRpcUrl as string,
			SOL: baseCredentials.solRpcUrl as string,
		};

		const birdeyeApiKey = tokenCredentials.birdeyeApiKey as string;
		const alchemyApiKey = tokenCredentials.alchemyApiKey as string;

		// Initialize providers
		const birdeyeProvider = new BirdeyeProvider({ apiKey: birdeyeApiKey });
		const alchemyProvider = new AlchemyProvider({ apiKey: alchemyApiKey });
		const bscProvider = new ethers.JsonRpcProvider(RPC_URLS.BNB);
		const solanaProvider = new Connection(RPC_URLS.SOL);

		// Initialize plugins map
		const pluginMap = new Map();

		// Initialize plugins based on available tools
		for (const tool of tools) {
			try {
				switch (tool.name) {
					case ToolName.SWAP_TOOL:
						if (!pluginMap.has('swap')) {
							const kyber = new KyberProvider(bscProvider, 56);
							const jupiter = new JupiterProvider(solanaProvider);
							const swapPlugin = new SwapPlugin();
							await swapPlugin.initialize({
								defaultSlippage: 0.5,
								defaultChain: SupportChain.BNB,
								providers: [kyber, jupiter],
								supportedChains: [SupportChain.BNB, SupportChain.ETHEREUM, SupportChain.SOLANA],
							});
							pluginMap.set('swap', swapPlugin);
						}
						break;

					case ToolName.BRIDGE_TOOL:
						if (!pluginMap.has('bridge')) {
							const debridge = new deBridgeProvider([bscProvider, solanaProvider], 56, 7565164);
							const bridgePlugin = new BridgePlugin();
							await bridgePlugin.initialize({
								supportedChains: [SupportChain.BNB, SupportChain.ETHEREUM, SupportChain.SOLANA],
								providers: [debridge],
							});
							pluginMap.set('bridge', bridgePlugin);
						}
						break;

					case ToolName.TOKEN_TOOL:
						if (!pluginMap.has('token')) {
							const tokenPlugin = new TokenPlugin();
							await tokenPlugin.initialize({
								defaultChain: SupportChain.BNB,
								providers: [birdeyeProvider, alchemyProvider],
								supportedChains: [SupportChain.SOLANA, SupportChain.BNB, SupportChain.ETHEREUM],
							});
							pluginMap.set('token', tokenPlugin);
						}
						break;

					case ToolName.WALLET_TOOL:
						if (!pluginMap.has('wallet')) {
							const walletPlugin = new WalletPlugin();
							await walletPlugin.initialize({
								defaultChain: SupportChain.BNB,
								providers: [birdeyeProvider, alchemyProvider],
								supportedChains: [SupportChain.BNB, SupportChain.SOLANA, SupportChain.ETHEREUM],
							});
							pluginMap.set('wallet', walletPlugin);
						}
						break;
				}
			} catch (error) {
				console.log(`Error initializing ${tool.name}:`, error);
			}
		}

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const llm = new N8nLLM(await getChatModel(this));
				const memory = (await getOptionalMemory(this)) as BaseChatMemory;
				const n8nOptions = this.getNodeParameter('options', itemIndex, {}) as {
					systemMessage?: string;
					maxIterations?: number;
					returnIntermediateSteps?: boolean;
					passthroughBinaryImages?: boolean;
				};

				const networks = getNetworksConfig(RPC_URLS);
				const network = new Network({ networks });
				const wallet = new Wallet(
					{
						seedPhrase:
							(walletCredentials.mnemonic as string) ||
							'test test test test test test test test test test test test',
						index: 0,
					},
					network,
				);

				const binkAgent = new N8nBinkAgent(
					llm,
					typeAgent,
					memory,
					tools,
					outputParser,
					{
						temperature: 0.5,
						systemPrompt: SYSTEM_MESSAGE,
					},
					wallet,
					networks,
					n8nOptions,
				);

				// Register all initialized plugins
				for (const plugin of pluginMap.values()) {
					await binkAgent.registerPlugin(plugin);
				}

				const input = getPromptInputByType({
					ctx: this,
					i: itemIndex,
					inputKey: 'text',
					promptTypeKey: 'promptType',
				});

				if (input === undefined) {
					throw new NodeOperationError(this.getNode(), 'The "text" parameter is empty.');
				}

				const response = await binkAgent.execute({ input });

				if (memory && outputParser) {
					const parsedOutput = jsonParse<{ output: Record<string, unknown> }>(
						response.output as string,
					);
					response.output = parsedOutput?.output ?? parsedOutput;
				}

				const itemResult = {
					json: omit(
						response,
						'system_message',
						'formatting_instructions',
						'input',
						'chat_history',
						'agent_scratchpad',
					),
				};

				returnData.push(itemResult);
			} catch (error) {
				console.log('Error processing item:', error);
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message || 'An error occurred' },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}