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
				name: 'binkWalletCredential',
				required: true,
			},
		]
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		this.logger.info('Supplying data for ToolWallet for BinkAIs');
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
