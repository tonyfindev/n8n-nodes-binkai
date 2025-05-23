/* eslint-disable n8n-nodes-base/node-dirname-against-convention */
import {
	NodeConnectionType,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
	type INodeProperties,
} from 'n8n-workflow';

import { logWrapper } from '../../../utils/logWrapper';
import { getConnectionHintNoticeField } from '../../../utils/sharedFields';
import { DynamicTool } from '@langchain/core/tools';
import { ToolName } from '../../../utils/toolName';

const bscBridgeProvider: INodeProperties[] = [
	{
		displayName: 'BSC Bridge Provider',
		name: 'bscBridgeProvider',
		type: 'multiOptions',
		description: 'The provider to use for the BSC bridge. You can select multiple providers. Will be updated soon for more providers.',
		required: true,
		options: [
			{
				displayName: 'BSC Provider',
				name: 'bscProvider',
				value: 'bscProvider',
			},
		],
		default: 'bscProvider',
	},
];

const solanaBridgeProvider: INodeProperties[] = [
	{
		displayName: 'Solana Bridge Provider',
		name: 'solanaBridgeProvider',
		type: 'multiOptions',
		description: 'The provider to use for the Solana bridge. You can select multiple providers. Will be updated soon for more providers.',
		required: true,
		options: [
			{
				displayName: 'Solana Provider',
				name: 'solanaProvider',
				value: 'solanaProvider',
			},
		],
		default: 'solanaProvider',
	},
];

export class ToolBridge implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Bridge Tool for BinkAI',
		name: ToolName.BRIDGE_TOOL,
		icon: 'file:../../icons/bridge_bink_ai.svg',
		iconColor: 'black',
		group: ['transform'],
		version: 1,
		description: 'Make it easier for AI agents to perform arithmetic',
		defaults: {
			name: 'BinkAI Bridge',
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
			...bscBridgeProvider,
			...solanaBridgeProvider,
		],
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		this.logger.info('Supplying data for ToolBridge for BinkAIs');
		const tool = new DynamicTool({
			name: ToolName.BRIDGE_TOOL,
			description: 'Bridge tool for BinkAI',
			func: async (subject: string) => {
				return subject;
			},
		});

		return {
			response: logWrapper(tool, this),
		};
	}
}
