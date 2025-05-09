import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
    INodeInputConfiguration,
	INodeInputFilter,
} from 'n8n-workflow';
import { Agent, Wallet, Network, NetworksConfig, NetworkName, logger } from '@binkai/core';
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

function getInputs(
	agent:
		| 'toolsAgent'
		| 'conversationalAgent'
		| 'openAiFunctionsAgent'
		| 'planAndExecuteAgent'
		| 'reActAgent'
		| 'sqlAgent',
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
			{
				type: 'ai_tool' as NodeConnectionType,
			},
			{
				type: 'ai_outputParser' as NodeConnectionType,
			},
		];
	} else if (agent === 'toolsAgent') {
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
	} else if (agent === 'openAiFunctionsAgent') {
		specialInputs = [
			{
				type: 'ai_languageModel' as NodeConnectionType,
				filter: {
					nodes: [
						'@n8n/n8n-nodes-langchain.lmChatOpenAi',
						'@n8n/n8n-nodes-langchain.lmChatAzureOpenAi',
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
	} else if (agent === 'reActAgent') {
		specialInputs = [
			{
				type: 'ai_languageModel' as NodeConnectionType,
			},
			{
				type: 'ai_tool' as NodeConnectionType,
			},
			{
				type: 'ai_outputParser' as NodeConnectionType,
			},
		];
	} else if (agent === 'sqlAgent') {
		specialInputs = [
			{
				type: 'ai_languageModel' as NodeConnectionType,
			},
			{
				type: 'ai_memory' as NodeConnectionType,
			},
		];
	} else if (agent === 'planAndExecuteAgent') {
		specialInputs = [
			{
				type: 'ai_languageModel' as NodeConnectionType,
			},
			{
				type: 'ai_tool' as NodeConnectionType,
			},
			{
				type: 'ai_outputParser' as NodeConnectionType,
			},
		];
	}

	if (hasOutputParser === false) {
		specialInputs = specialInputs.filter((input) => input.type !== 'ai_outputParser');
	}
	return ['main', ...getInputData(specialInputs)] as Array<NodeConnectionType | INodeInputConfiguration>;
}
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
		credentials: [
			{
				name: 'binkaiCredentialsApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Input Message',
				name: 'input',
				type: 'string',
				default: '',
				description: 'Chat input from user',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const input = this.getNodeParameter('input', 0) as string;
		const credentials = await this.getCredentials('binkaiCredentialsApi');
		const mnemonic = credentials.walletMnemonic as string;
		const openaiApiKey = credentials.apiKey as string;

		if (openaiApiKey) {
			process.env.OPENAI_API_KEY = openaiApiKey;
		}
		logger.enable(); // optional

		const BSC_RPC_URL = 'https://binance.llamarpc.com';
		const ETHEREUM_RPC_URL = 'https://eth.llamarpc.com';
		const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
		const BIRDEYE_API_KEY = '';
		const ALCHEMY_API_KEY = '';
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

		const agent = new Agent(
			{
				model: 'gpt-4o',
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

		await agent.registerPlugin(swapPlugin);
		await agent.registerPlugin(walletPlugin);
		await agent.registerPlugin(tokenPlugin);
		await agent.registerPlugin(stakingPlugin);
		await agent.registerPlugin(bridgePlugin);

		const response = await agent.execute(input);

		return [
			[
				{
					json: {
						result: typeof response === 'string' ? response : JSON.stringify(response, null, 2),
					},
				},
			],
		];
	}
}
