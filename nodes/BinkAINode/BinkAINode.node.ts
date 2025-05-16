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
import { getOptionalOutputParser } from '../../utils/output_parsers/N8nOutputParser';
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
import { N8NModel } from './N8NModel';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { RunnableSequence } from '@langchain/core/runnables';
import { omit } from 'lodash';

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
		const outputParser = await getOptionalOutputParser(this);
		const tools = await getTools(this, outputParser);
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

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const model = await getChatModel(this);
				const memory = await getOptionalMemory(this);

				const input = getPromptInputByType({
					ctx: this,
					i: itemIndex,
					inputKey: 'text',
					promptTypeKey: 'promptType',
				});
				if (input === undefined) {
					throw new NodeOperationError(this.getNode(), 'The “text” parameter is empty.');
				}

				const options = this.getNodeParameter('options', itemIndex, {}) as {
					systemMessage?: string;
					maxIterations?: number;
					returnIntermediateSteps?: boolean;
					passthroughBinaryImages?: boolean;
				};

				// Prepare the prompt messages and prompt template.
				const messages = await prepareMessages(this, itemIndex, {
					systemMessage: options.systemMessage,
					passthroughBinaryImages: options.passthroughBinaryImages ?? true,
					outputParser,
				});
				const prompt = preparePrompt(messages);

				// Create the base agent that calls tools.
				const agent = createToolCallingAgent({
					llm: model,
					tools,
					prompt,
				});
				agent.streamRunnable = false;

				const runnableAgent = RunnableSequence.from([
					agent,
					getAgentStepsParser(outputParser, memory),
					fixEmptyContentMessage,
				]);
				const executor = AgentExecutor.fromAgentAndTools({
					agent: runnableAgent,
					memory,
					tools,
					returnIntermediateSteps: options.returnIntermediateSteps === true,
					maxIterations: options.maxIterations ?? 10,
				});

				const response = await executor.invoke(
					{
						input,
						system_message: options.systemMessage ?? SYSTEM_MESSAGE,
						formatting_instructions:
							'IMPORTANT: For your response to user, you MUST use the `format_final_json_response` tool with your complete answer formatted according to the required schema. Do not attempt to format the JSON manually - always use this tool. Your response will be rejected if it is not properly formatted through this tool. Only use this tool once you are ready to provide your final answer.',
					},
					{ signal: this.getExecutionCancelSignal() },
				);

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
