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
		default: '',
	},
	{
		displayName: 'Birdeye API Key',
		name: 'birdeyeApiKey',
		type: 'string',
		default: '',
		
	}
] as INodeProperties[];

export class BinkAICredentialsApi implements ICredentialType {
	name = 'binkaiCredentialsApi';
	displayName = 'Bink AI Credentials API';
	properties: INodeProperties[] = [
		{
			displayName: 'Wallet Mnemonic',
			name: 'walletMnemonic',
			type: 'string',
			default: '',
		},
		// {
		// 	displayName: 'OpenAI API Key',
		// 	name: 'apiKey',
		// 	type: 'string',
		// 	default: '',
		// },
		...apiProviderProperties,
	];
	authenticate = {
		type: 'generic',
		properties: {
			qs: {
				api_key: '={{$credentials.apiKey}}',
				wallet_mnemonic: '={{$credentials.walletMnemonic}}',
				alchemy_api_key: '={{$credentials.alchemyApiKey}}',
				birdeye_api_key: '={{$credentials.birdeyeApiKey}}',
			},
		},
	} as IAuthenticateGeneric;

	// The block below tells how this credential can be tested
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.openai.com/v1/chat/completions',
			url: '',
		},
	};
}
