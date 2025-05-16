import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
    INodeInputConfiguration,
	INodeInputFilter,
	INodeProperties,
	NodeOperationError
} from 'n8n-workflow';
import { conversationalAgentProperties, pluginsTypeProperties } from './description';
import { textInput, textFromPreviousNode } from '../../utils/descriptions';
import { getOptionalOutputParser } from '../../utils/output_parsers/N8nOutputParser';
import { isChatInstance, getPromptInputByType, getConnectedTools } from '../../utils/helpers';
import { checkForStructuredTools, extractParsedOutput } from '../../utils/utils';

import type { BaseChatMemory } from '@langchain/community/memory/chat_memory';
import { Agent, Wallet, Network, NetworksConfig, NetworkName, logger, OpenAIModel } from '@binkai/core';
import { SwapPlugin } from '@binkai/swap-plugin';
import { TokenPlugin } from '@binkai/token-plugin';
import { BridgePlugin } from '@binkai/bridge-plugin';
import { StakingPlugin } from '@binkai/staking-plugin';
import { WalletPlugin } from '@binkai/wallet-plugin';
import { JsonRpcProvider } from 'ethers';
import { BnbProvider, SolanaProvider } from '@binkai/rpc-provider';
import { ThenaProvider } from '@binkai/thena-provider';
import { PancakeSwapProvider } from '@binkai/pancakeswap-provider';
import { VenusProvider } from '@binkai/venus-provider';
import { OkuProvider } from '@binkai/oku-provider';
import { KyberProvider } from '@binkai/kyber-provider';
import { FourMemeProvider } from '@binkai/four-meme-provider';
import { JupiterProvider } from '@binkai/jupiter-provider';
import { Connection } from '@solana/web3.js';
import { deBridgeProvider } from '@binkai/debridge-provider';
import { BirdeyeProvider } from '@binkai/birdeye-provider';
import { AlchemyProvider } from '@binkai/alchemy-provider';
import { PromptTemplate } from '@langchain/core/prompts';
import { N8NModel } from './N8NModel';

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
			// ai_tool: 'Tool',
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

	if (agent === 'conversationalAgent') {
		specialInputs = [
			{
				type: 'ai_languageModel' as NodeConnectionType,
				filter: {
					nodes: [
						'@n8n/n8n-nodes-langchain.lmChatAnthropic',
						'@n8n/n8n-nodes-langchain.lmChatAwsBedrock',
						'@n8n/n8n-nodes-langchain.lmChatGroq',
						'@n8n/n8n-nodes-langchain.lmChatOllama',
						'@n8n/n8n-nodes-langchain.lmChatOpenAi',
						'@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
						'@n8n/n8n-nodes-langchain.lmChatGoogleVertex',
						'@n8n/n8n-nodes-langchain.lmChatMistralCloud',
						'@n8n/n8n-nodes-langchain.lmChatAzureOpenAi',
						'@n8n/n8n-nodes-langchain.lmChatDeepSeek',
						'@n8n/n8n-nodes-langchain.lmChatOpenRouter',
						'@n8n/n8n-nodes-langchain.lmChatXAiGrok',
					],
				},
			},
			{
				type: 'ai_memory' as NodeConnectionType,
			},
			// {
			// 	type: 'ai_tool' as NodeConnectionType,
			// },
			{
				type: 'ai_outputParser' as NodeConnectionType,
			},
		];
	}
	// } else if (agent === 'toolsAgent') {
	// 	specialInputs = [
	// 		{
	// 			type: 'ai_languageModel' as NodeConnectionType,
	// 			filter: {
	// 				nodes: [
	// 					'@n8n/n8n-nodes-langchain.lmChatAnthropic',
	// 					'@n8n/n8n-nodes-langchain.lmChatAzureOpenAi',
	// 					'@n8n/n8n-nodes-langchain.lmChatAwsBedrock',
	// 					'@n8n/n8n-nodes-langchain.lmChatMistralCloud',
	// 					'@n8n/n8n-nodes-langchain.lmChatOllama',
	// 					'@n8n/n8n-nodes-langchain.lmChatOpenAi',
	// 					'@n8n/n8n-nodes-langchain.lmChatGroq',
	// 					'@n8n/n8n-nodes-langchain.lmChatGoogleVertex',
	// 					'@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
	// 					'@n8n/n8n-nodes-langchain.lmChatDeepSeek',
	// 					'@n8n/n8n-nodes-langchain.lmChatOpenRouter',
	// 					'@n8n/n8n-nodes-langchain.lmChatXAiGrok',
	// 				],
	// 			},
	// 		},
	// 		{
	// 			type: 'ai_memory' as NodeConnectionType,
	// 		},
	// 		// {
	// 		// 	type: 'ai_tool' as NodeConnectionType,
	// 		// 	required: true,
	// 		// },
	// 		{
	// 			type: 'ai_outputParser' as NodeConnectionType,
	// 		},
	// 	];
	
	if (hasOutputParser === false) {
		specialInputs = specialInputs.filter((input) => input.type !== 'ai_outputParser');
	}
	return ['main', ...getInputData(specialInputs)] as Array<NodeConnectionType | INodeInputConfiguration>;
}

const agentTypeProperty: INodeProperties = {
	displayName: 'Agent',
	name: 'agent',
	type: 'options',
	noDataExpression: true,
	// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
	options: [
		{
			name: 'Conversational Agent',
			value: 'conversationalAgent',
			description:
				'Describes tools in the system prompt and parses JSON responses for tool calls. More flexible but potentially less reliable than the Tools Agent. Suitable for simpler interactions or with models not supporting structured schemas.',
		},
		// {
		// 	name: 'Tools Agent',
		// 	value: 'toolsAgent',
		// 	description:
		// 		'Utilizes structured tool schemas for precise and reliable tool selection and execution. Recommended for complex tasks requiring accurate and consistent tool usage, but only usable with models that support tool calling.',
		// },
		
		// {
		// 	name: 'OpenAI Functions Agent',
		// 	value: 'openAiFunctionsAgent',
		// 	description:
		// 		"Leverages OpenAI's function calling capabilities to precisely select and execute tools. Excellent for tasks requiring structured outputs when working with OpenAI models.",
		// },
		// {
		// 	name: 'Plan and Execute Agent',
		// 	value: 'planAndExecuteAgent',
		// 	description:
		// 		'Creates a high-level plan for complex tasks and then executes each step. Suitable for multi-stage problems or when a strategic approach is needed.',
		// },
		// {
		// 	name: 'ReAct Agent',
		// 	value: 'reActAgent',
		// 	description:
		// 		'Combines reasoning and action in an iterative process. Effective for tasks that require careful analysis and step-by-step problem-solving.',
		// },
	
	],
	default: '',
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
			name: 'Define below',
			value: 'define',
			description: 'Use an expression to reference data in previous nodes or enter static text',
		},
	],
	default: 'auto',
};



export const SYSTEM_MESSAGE = `Assistant is a large language model trained by OpenAI.

Assistant is designed to be able to assist with a wide range of tasks, from answering simple questions to providing in-depth explanations and discussions on a wide range of topics. As a language model, Assistant is able to generate human-like text based on the input it receives, allowing it to engage in natural-sounding conversations and provide responses that are coherent and relevant to the topic at hand.

Assistant is constantly learning and improving, and its capabilities are constantly evolving. It is able to process and understand large amounts of text, and can use this knowledge to provide accurate and informative responses to a wide range of questions. Additionally, Assistant is able to generate its own text based on the input it receives, allowing it to engage in discussions and provide explanations and descriptions on a wide range of topics.

Overall, Assistant is a powerful system that can help with a wide range of tasks and provide valuable insights and information on a wide range of topics. Whether you need help with a specific question or just want to have a conversation about a particular topic, Assistant is here to assist.`;

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

export class BinkAINode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Bink AI Agent',
		name: 'binkAgentNode',
		group: ['transform'],
		version: 1,
		icon: 'file:bink_logo.svg',
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
        outputs: [NodeConnectionType.Main],
		
		properties: [
			{
				displayName:
					'Tip: Get a feel for agents with our quick <a href="https://docs.n8n.io/advanced-ai/intro-tutorial/" target="_blank">tutorial</a> or see an <a href="/templates/1954" target="_blank">example</a> of how this node works',
				name: 'notice_tip',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						agent: ['conversationalAgent'],
					},
				},
			},
			// Make Conversational Agent the default agent for versions 1.5 and below
			{
				...agentTypeProperty,
				options: agentTypeProperty?.options?.filter(
					(o) => 'value' in o && o.value !== 'toolsAgent',
				),
				displayOptions: { show: { '@version': [{ _cnd: { lte: 1.5 } }] } },
				default: 'conversationalAgent',
			},
	
			{
				...promptTypeOptions,
				displayOptions: {
					hide: {
						// '@version': [{ _cnd: { lte: 1.2 } }],
						agent: ['sqlAgent'],
					},
				},
			},
			{
				...textFromPreviousNode,
				displayOptions: {
					show: { promptType: ['auto'], '@version': [{ _cnd: { gte: 1.7 } }] },
					// SQL Agent has data source and credentials parameters so we need to include this input there manually
					// to preserve the order
					hide: {
						agent: ['sqlAgent'],
					},
				},
			},
			{
				...textInput,
				displayOptions: {
					show: {
						promptType: ['define'],
					},
					hide: {
						agent: ['sqlAgent'],
					},
				},
			},
			{
				displayName: 'For more reliable structured output parsing, consider using the Tools agent',
				name: 'notice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						hasOutputParser: [true],
						agent: [
							'conversationalAgent',
				
						],
					},
				},
			},
			{
				displayName: 'Require Specific Output Format',
				name: 'hasOutputParser',
				type: 'boolean',
				default: false,
				noDataExpression: true,
				displayOptions: {
					hide: {
						'@version': [{ _cnd: { lte: 1.2 } }],
						agent: ['sqlAgent'],
					},
				},
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
			{
				displayName: 'Plugins',
				name: 'plugins',
				type: 'multiOptions',
				default: 'auto',
				options: pluginsTypeProperties.options,
			},

			// ...toolsAgentProperties,
			...conversationalAgentProperties,
		
		],
		credentials: [
			{
				name: 'binkaiCredentialsApi',
				required: true,
			},
		],
	};

		

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const selectedPlugins = this.getNodeParameter('plugins', 0, 'auto') as string[];
		const model = await this.getInputConnectionData(NodeConnectionType.AiLanguageModel, 0);

		
		const credentials = await this.getCredentials('binkaiCredentialsApi');
		const mnemonic = credentials.walletMnemonic as string;
		const BIRDEYE_API_KEY = credentials.birdeyeApiKey as string || '';
		const ALCHEMY_API_KEY = credentials.alchemyApiKey as string || '';

			
		// TODO: initialize all BinkAI plugins
		const BSC_RPC_URL = 'https://binance.llamarpc.com';
		const ETHEREUM_RPC_URL = 'https://eth.llamarpc.com';
		const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
		
		const networks: NetworksConfig['networks'] = {
			bnb: {
				type: 'evm',
				config: {
					chainId: 56,
					rpcUrl: BSC_RPC_URL,
					name: 'BNB Chain',
					nativeCurrency: {
						name: 'BNB',
						symbol: 'BNB',
						decimals: 18,
					},
				},
			},
			ethereum: {
				type: 'evm',
				config: {
					chainId: 1,
					rpcUrl: ETHEREUM_RPC_URL,
					name: 'Ethereum',
					nativeCurrency: {
						name: 'Ether',
						symbol: 'ETH',
						decimals: 18,
					},
				},
			},
			[NetworkName.SOLANA]: {
				type: 'solana',
				config: {
					rpcUrl: SOLANA_RPC_URL,
					name: 'Solana',
					nativeCurrency: {
						name: 'Solana',
						symbol: 'SOL',
						decimals: 9,
					},
				},
			},
		};

		const network = new Network({ networks });
		const wallet = new Wallet(
			{
				seedPhrase: mnemonic || 'test test test test test test test test test test test test',
				index: 0,
			},
			network,
		);

	
		const n8nLLM = new N8NModel(model)
		const agent = new Agent(
			n8nLLM,
			{
				temperature: 0,
			},
			wallet,
			networks,
		);

		const swapPlugin = new SwapPlugin();
		const bridgePlugin = new BridgePlugin();
		const tokenPlugin = new TokenPlugin();
		const stakingPlugin = new StakingPlugin();
		const walletPlugin = new WalletPlugin();
		const bnbProvider = new BnbProvider({ rpcUrl: BSC_RPC_URL });
		const solanaProvider = new SolanaProvider({ rpcUrl: SOLANA_RPC_URL });
		const bscProvider = new JsonRpcProvider(BSC_RPC_URL);
		const thena = new ThenaProvider(bscProvider, 56);
		const pancakeswap = new PancakeSwapProvider(bscProvider, 56);
		const fourMeme = new FourMemeProvider(bscProvider, 56);
		const venus = new VenusProvider(bscProvider, 56);
		const oku = new OkuProvider(bscProvider, 56);
		const kyber = new KyberProvider(bscProvider, 56);
		const jupiter = new JupiterProvider(new Connection(SOLANA_RPC_URL));

		const birdeyeApi = new BirdeyeProvider({
			apiKey: BIRDEYE_API_KEY,
		});

		const alchemyApi = new AlchemyProvider({
			apiKey: ALCHEMY_API_KEY,
		});

		const debridge = new deBridgeProvider(
			[bscProvider, new Connection(SOLANA_RPC_URL)],
			56,
			7565164,
		);

		await walletPlugin.initialize({
			defaultChain: 'bnb',
			providers: [bnbProvider, birdeyeApi, alchemyApi, solanaProvider],
			supportedChains: ['bnb', 'solana', 'ethereum'],
		});

		await swapPlugin.initialize({
			defaultSlippage: 0.5,
			defaultChain: 'bnb',
			providers: [pancakeswap, fourMeme, thena, oku, kyber, jupiter],
			supportedChains: ['bnb', 'solana'],
		});

		await tokenPlugin.initialize({
			defaultChain: 'bnb',
			providers: [birdeyeApi],
			supportedChains: ['solana', 'bnb', 'ethereum'],
		});

		await stakingPlugin.initialize({
			defaultSlippage: 0.5,
			defaultChain: 'bnb',
			providers: [venus],
			supportedChains: ['bnb', 'ethereum'],
		});

		await bridgePlugin.initialize({
			defaultChain: 'bnb',
			providers: [debridge],
			supportedChains: ['bnb', 'solana'],
		});

		

		const pluginMap = {
			'binkSwap': swapPlugin,
			'binkWallet': walletPlugin,
			'binkToken': tokenPlugin,
			'binkStaking': stakingPlugin,
			'binkBridge': bridgePlugin
		};
		
		await Promise.all(
			selectedPlugins
				.filter(plugin => plugin in pluginMap)
				.map(plugin => agent.registerPlugin(pluginMap[plugin]))
		);
		
		this.logger.debug('Executing Conversational Agent');

		if (!isChatInstance(model)) {
			throw new NodeOperationError(this.getNode(), 'Conversational Agent requires Chat Model');
		}


		const memory = (await this.getInputConnectionData(NodeConnectionType.AiMemory, 0)) as
			| BaseChatMemory
			| undefined;


		// const tools = await getConnectedTools(this, nodeVersion >= 1.5, true, true);
		const outputParser = await getOptionalOutputParser(this);
		

		// await checkForStructuredTools(tools, this.getNode(), 'Conversational Agent');

		// TODO: Make it possible in the future to use values for other items than just 0
		// const options = this.getNodeParameter('options', 0, {}) as {
		// 	systemMessage?: string;
		// 	humanMessage?: string;
		// 	maxIterations?: number;
		// 	returnIntermediateSteps?: boolean;
		// };

		const returnData: INodeExecutionData[] = [];

		let prompt: PromptTemplate | undefined;
		if (outputParser) {
			const formatInstructions = outputParser.getFormatInstructions();

			prompt = new PromptTemplate({
				template: '{input}\n{formatInstructions}',
				inputVariables: ['input'],
				partialVariables: { formatInstructions },
			});
		}

		const items = this.getInputData();
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				let input;

			
				input = getPromptInputByType({
					ctx: this,
					i: itemIndex,
					inputKey: 'text',
					promptTypeKey: 'promptType',
				});

				if (input === undefined) {
					throw new NodeOperationError(this.getNode(), "The 'text' parameter is empty.");
				}

				if (prompt) {
					input = (await prompt.invoke({ input, memory })).value;
				}

	

				const response = await agent.execute(input);

				if (outputParser) {
					response.output = await extractParsedOutput(this, outputParser, response.output as string);
				}

				returnData.push({ json: response });
				
				logger.enable(); // optional

			} catch (error) {
				throw new Error(`Error executing BinkAI node: ${error.message}`);
			}
		}
		
		return [returnData]; // Return after processing all items
	}
}
