import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

const apiProviderProperties = [
	{
		displayName: 'Alchemy API Key',
		name: 'alchemyApiKey',
		type: 'string',
		typeOptions: {
			password: true,
		},
		default: '',
	},
	{
		displayName: 'Birdeye API Key',
		name: 'birdeyeApiKey',
		type: 'string',
		typeOptions: {
			password: true,
		},
		default: '',
	},
	{
		displayName: 'Solana RPC URL',
		name: 'solRpcUrl',
		type: 'string',
		default: 'https://api.mainnet-beta.solana.com',
	},
	{
		displayName: 'Ethereum RPC URL',
		name: 'ethRpcUrl',
		type: 'string',
		default: 'wss://ethereum-rpc.publicnode.com',
	},
	{
		displayName: 'BNB Chain RPC URL',
		name: 'bnbRpcUrl',
		type: 'string',
		default: 'https://bsc-dataseed1.binance.org',
	},
] as INodeProperties[];

export class BinkAICredentialsApi implements ICredentialType {
	name = 'binkaiCredentialsApi';
	displayName = 'Bink AI Credentials API';
	properties: INodeProperties[] = [
		{
			displayName: 'Wallet Mnemonic',
			name: 'walletMnemonic',
			type: 'string',
			description: 'The mnemonic of the wallet to use for the agent',
			required: true,
			typeOptions: {
				password: true,
			},
			default: '',
		},
		...apiProviderProperties,
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			qs: {
				api_key: '={{$credentials.apiKey}}',
				wallet_mnemonic: '={{$credentials.walletMnemonic}}',
				alchemy_api_key: '={{$credentials.alchemyApiKey}}',
				birdeye_api_key: '={{$credentials.birdeyeApiKey}}',
				sol_rpc_url: '={{$credentials.solRpcUrl}}',
				eth_rpc_url: '={{$credentials.ethRpcUrl}}',
				bnb_rpc_url: '={{$credentials.bnbRpcUrl}}',
			},
		},
	};

	// The block below tells how this credential can be tested
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.openai.com/v1/chat/completions',
			url: '',
		},
	};
}
