/* eslint-disable n8n-nodes-base/node-dirname-against-convention */
import {
	NodeConnectionType,
	type INodeType,
	type INodeProperties,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
	IExecuteFunctions,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';

import { logWrapper } from '../../../utils/logWrapper';
import { getConnectionHintNoticeField } from '../../../utils/sharedFields';
import { DynamicTool } from '@langchain/core/tools';
import { ToolName } from '../../../utils/toolName';
import { SupportChain } from '../../../utils/networks';
import { TokenPlugin } from '@binkai/token-plugin';
import { BirdeyeProvider } from '@binkai/birdeye-provider';
import { AlchemyProvider } from '@binkai/alchemy-provider';



export class ToolToken implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Token Tool for BinkAI',
		name: ToolName.TOKEN_TOOL,
		icon: 'file:../../icons/token_bink_ai.svg',
		iconColor: 'black',
		group: ['transform'],
		version: 1,
		description: 'Make it easier for AI agents to perform arithmetic',
		defaults: {
			name: 'BinkAI Token',
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
		properties: [
			getConnectionHintNoticeField([NodeConnectionType.AiAgent]),
			// ...protocolsTypeProperties,
		],
		credentials: [
			{
				name: 'binkaiTokenCredentials',
				required: true,
			},
		],
	};

	private static tokenPlugin?: TokenPlugin;
	

	async getTokenPlugin(): Promise<any> {
		return ToolToken.tokenPlugin;
	}


	async supplyData(this: ISupplyDataFunctions): Promise<any> {
		this.logger.info('Supplying data for ToolToken for BinkAIs');
		
		const tokenCredentials = await this.getCredentials('binkaiTokenCredentials');
		const birdeyeApiKey = tokenCredentials.birdeyeApiKey as string;
		const alchemyApiKey = tokenCredentials.alchemyApiKey as string;


		const birdeyeProvider = new BirdeyeProvider({ apiKey: birdeyeApiKey });
		const alchemyProvider = new AlchemyProvider({ apiKey: alchemyApiKey });

		const tokenPlugin = new TokenPlugin();
		await tokenPlugin.initialize({
			defaultChain: SupportChain.BNB,
			providers: [birdeyeProvider, alchemyProvider],
			supportedChains: [SupportChain.SOLANA, SupportChain.BNB, SupportChain.ETHEREUM],
		});
    	ToolToken.tokenPlugin = tokenPlugin; // Use static property

		const tool = new DynamicTool({
			name: ToolName.TOKEN_TOOL,
			description: 'Token tool for BinkAI',
			func: async (subject: string) => {
				return subject;
			},
		});
		
		return {
			response: logWrapper(tool, this),
		};
	}
}