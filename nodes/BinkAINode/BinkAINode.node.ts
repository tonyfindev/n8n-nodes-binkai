import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	INodeInputConfiguration,
	INodeInputFilter,
	INodeProperties,
	NodeOperationError,
	jsonParse,
} from 'n8n-workflow';
import { conversationalAgentProperties, pluginsTypeProperties } from './description';
import { textInput, textFromPreviousNode } from '../../utils/descriptions';
import { getOptionalOutputParser, N8nOutputParser } from '../../utils/output_parsers/N8nOutputParser';
import { isChatInstance, getPromptInputByType, getConnectedTools } from '../../utils/helpers';
import { checkForStructuredTools, extractParsedOutput } from '../../utils/utils';
import {
	fixEmptyContentMessage,
	getAgentStepsParser,
	getChatModel,
	getOptionalMemory,
	getTools,
	prepareMessages,
	preparePrompt,
} from '../../utils/common';

import type { BaseChatMemory } from '@langchain/community/memory/chat_memory';
import {
	Agent,
	Wallet,
	Network,
	NetworksConfig,
	NetworkName,
	logger,
	OpenAIModel,
	NetworkType,
} from '@binkai/core';
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
import { N8nLLM } from './N8nLLM';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { RunnableSequence } from '@langchain/core/runnables';
import { omit } from 'lodash';
import { n8nBinkAgent } from './agentBink';
import { DynamicStructuredTool } from '@langchain/core/tools';

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


export const SYSTEM_MESSAGE = `You are a BINK AI agent. You are able to perform bridge and get token information on multiple chains. If you do not have the token address, you can use the symbol to get the token information before performing a bridge.`;


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
	default: SYSTEM_MESSAGE,
}

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
		displayName: 'Bink AI Agent V2',
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
			{
				displayName: 'Plugins',
				name: 'plugins',
				type: 'multiOptions',
				default: 'auto',
				options: pluginsTypeProperties.options,
			},
			...[promptTypeOptions],
			...[textFromPreviousNode],
			...[textInput],
			...[agentTypeProperty],
			...toolsAgentProperties,
		],
		credentials: [
			{
				name: 'binkaiCredentialsApi',
				required: true,
			},
		],
	};

	

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const returnData: INodeExecutionData[] = [];
		const items = this.getInputData();
		const outputParser = await getOptionalOutputParser(this) as N8nOutputParser;
		const tools = await getTools(this, outputParser) as DynamicStructuredTool[];
		console.log('🚀 ~ BinkAINode ~ execute ~ tools:', tools);

		if (tools.includes('binkSwap' as any)) {
			// TODO: Implement binkSwap
		}

		if (tools.includes('binkToken' as any)) {
			// TODO: Implement binkToken
		}

		if (tools.includes('binkBridge' as any)) {
			// TODO: Implement binkBridge
		}

		if (tools.includes('binkStaking' as any)) {
			// TODO: Implement binkStaking
		}

		if (tools.includes('binkWallet' as any)) {
			// TODO: Implement binkWallet
		}

		if (tools.includes('binkBirdeye' as any)) {
			// TODO: Implement binkBirdeye
		}

		if (tools.includes('binkAlchemy' as any)) {
			// TODO: Implement binkAlchemy
		}

		const BNB_RPC = 'https://bsc-dataseed1.binance.org';
		const ETH_RPC = 'https://eth.llamarpc.com';

		const networks: NetworksConfig['networks'] = {
			bnb: {
			  type: 'evm' as NetworkType,
			  config: {
				chainId: 56,
				rpcUrl: BNB_RPC,
				name: 'BNB Chain',
				nativeCurrency: {
				  name: 'BNB',
				  symbol: 'BNB',
				  decimals: 18,
				},
			  },
			},
			ethereum: {
			  type: 'evm' as NetworkType,
			  config: {
				chainId: 1,
				rpcUrl: ETH_RPC,
				name: 'Ethereum',
				nativeCurrency: {
				  name: 'Ether',
				  symbol: 'ETH',
				  decimals: 18,
				},
			  },
			},
		};
		const network = new Network({ networks });
		const credentials = await this.getCredentials('binkaiCredentialsApi');
		const wallet = new Wallet(
			{
			  seedPhrase:
				credentials.walletMnemonic as string ||
				'test test test test test test test test test test test test',
			  index: 0,
			},
			network,
		);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const llm = new N8nLLM(await getChatModel(this));
				const memory = await getOptionalMemory(this) as BaseChatMemory;

				const binkAgent = new n8nBinkAgent(
					llm,
					memory,
					outputParser,
					tools,
					{
						temperature: 0.5,
						systemPrompt: SYSTEM_MESSAGE,
					},
					wallet,
					networks,
				);
				

				const input = getPromptInputByType({
					ctx: this,
					i: itemIndex,
					inputKey: 'text',
					promptTypeKey: 'promptType',
				});
				if (input === undefined) {
					throw new NodeOperationError(this.getNode(), 'The “text” parameter is empty.');
				}

				// const options = this.getNodeParameter('options', itemIndex, {}) as {
				// 	systemMessage?: string;
				// 	maxIterations?: number;
				// 	returnIntermediateSteps?: boolean;
				// 	passthroughBinaryImages?: boolean;
				// };

				// Prepare the prompt messages and prompt template.
				// const messages = await prepareMessages(this, itemIndex, {
				// 	systemMessage: options.systemMessage,
				// 	passthroughBinaryImages: options.passthroughBinaryImages ?? true,
				// 	outputParser,
				// });
				// const prompt = preparePrompt(messages);
				const response = await binkAgent.execute({
					input: input,
				});


				// const response = await agent.invoke(
				// 	{
				// 		input,
				// 		system_message: options.systemMessage ?? SYSTEM_MESSAGE,
				// 		formatting_instructions:
				// 			'IMPORTANT: For your response to user, you MUST use the `format_final_json_response` tool with your complete answer formatted according to the required schema. Do not attempt to format the JSON manually - always use this tool. Your response will be rejected if it is not properly formatted through this tool. Only use this tool once you are ready to provide your final answer.',
				// 	},
				// 	{ signal: this.getExecutionCancelSignal() },
				// );

				// If memory and outputParser are connected, parse the output.
				if (memory && outputParser) {
					const parsedOutput = jsonParse<{ output: Record<string, unknown> }>(
						response.output as string,
					);
					response.output = parsedOutput?.output ?? parsedOutput;
				}

				// Omit internal keys before returning the result.
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
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message },
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
