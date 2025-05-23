/* eslint-disable n8n-nodes-base/node-dirname-against-convention */
import {
	NodeConnectionType,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

import { logWrapper } from '../../../utils/logWrapper';
import { getConnectionHintNoticeField } from '../../../utils/sharedFields';
import { DynamicTool } from '@langchain/core/tools';
import { ToolName } from '../../../utils/toolName';

const bnbPotocolsTypeProperties: INodeProperties[] = [
	{
		displayName: 'BNB Swap Protocols',
		name: 'bnbSwapProtocols',
		type: 'multiOptions',
		description: 'The swap protocols to use for the agent. You can select multiple protocols.',
		options: [
			{
				name: 'Kyber',
				value: 'kyber',
			},
			{
				name: 'OKU',
				value: 'oku',
			},
			{
				name: 'Thena',
				value: 'thena',
			},
		],
		required: true,
		default: 'kyber',
	},
];

const solanaPotocolsTypeProperties: INodeProperties[] = [
	{
		displayName: 'Solana Swap Protocols',
		name: 'solanaSwapProtocols',
		type: 'multiOptions',
		description: 'The swap protocols to use for the agent. You can select multiple protocols.',
		options: [
		{
			name: 'Jupiter',
			value: 'jupiter',
		},
	],
		required: true,
		default: 'jupiter',
	},
];

export class ToolSwap implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Swap Tool for BinkAI',
		name: ToolName.SWAP_TOOL,
		icon: 'file:../../icons/swap_bink_ai.svg',
		iconColor: 'black',
		group: ['transform'],
		version: 1,
		description: 'Make it easier for AI agents to perform arithmetic',
		defaults: {
			name: 'BinkAI Swap',
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
			...bnbPotocolsTypeProperties,
			...solanaPotocolsTypeProperties,
		],
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		this.logger.info('Supplying data for ToolSwap for BinkAIs');
		const tool = new DynamicTool({
			name: ToolName.SWAP_TOOL,
			description: 'Swap tool for BinkAI',
			func: async (subject: string) => {
				return subject;
			},
		});

		return {
			response: logWrapper(tool, this),
		};
	}
}
