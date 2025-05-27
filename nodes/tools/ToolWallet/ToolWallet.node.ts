/* eslint-disable n8n-nodes-base/node-dirname-against-convention */
import {
	NodeConnectionType,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

import { logWrapper } from '../../../utils/logWrapper';
import { getConnectionHintNoticeField } from '../../../utils/sharedFields';
import { DynamicTool } from '@langchain/core/tools';
import { ToolName } from '../../../utils/toolName';
import { WalletPlugin } from '@binkai/wallet-plugin';
import { SupportChain } from '../../../utils/networks';
import { AlchemyProvider } from '@binkai/alchemy-provider';
import { BirdeyeProvider } from '@binkai/birdeye-provider';

export class ToolWallet implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Wallet Tool for BinkAI',
		name: ToolName.WALLET_TOOL,
		icon: 'file:../../icons/wallet_bink_ai.svg',
		iconColor: 'black',
		group: ['transform'],
		version: 1,
		description: 'Make it easier for AI agents to perform arithmetic',
		defaults: {
			name: 'BinkAI Wallet',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Tools'],
				Tools: ['Other Tools'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://bink.ai',
					},
				],
			},
		},
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionType.AiTool],
		outputNames: ['Tool'],
		properties: [getConnectionHintNoticeField([NodeConnectionType.AiAgent])],
		credentials: [
			{
				name: 'binkaiTokenCredentials',
				required: true,
			},
		]
	};

	private static walletPlugin?: WalletPlugin;

	async getWalletPlugin(): Promise<any> {
		return ToolWallet.walletPlugin;
	}

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		this.logger.info('Supplying data for ToolWallet for BinkAIs');

		const tokenCredentials = await this.getCredentials('binkaiTokenCredentials');
		const birdeyeApiKey = tokenCredentials.birdeyeApiKey as string;
		const alchemyApiKey = tokenCredentials.alchemyApiKey as string;


		const birdeyeProvider = new BirdeyeProvider({ apiKey: birdeyeApiKey });
		const alchemyProvider = new AlchemyProvider({ apiKey: alchemyApiKey });

		const walletPlugin = new WalletPlugin();
		await walletPlugin.initialize({
			defaultChain: SupportChain.BNB,
			providers: [birdeyeProvider, alchemyProvider],
			supportedChains: [SupportChain.BNB, SupportChain.SOLANA, SupportChain.ETHEREUM],
		});
		ToolWallet.walletPlugin = walletPlugin;
		const tool = new DynamicTool({
			name: ToolName.WALLET_TOOL,
			description: 'Wallet tool for BinkAI',
			func: async (subject: string) => {
				return subject;
			},
		});

		return {
			response: logWrapper(tool, this),
		};
	}
}