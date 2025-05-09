import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

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
		{
			displayName: 'OpenAI API Key',
			name: 'apiKey',
			type: 'string',
			default: '',
		},
	];
	authenticate = {
		type: 'generic',
		properties: {
			qs: {
				api_key: '={{$credentials.apiKey}}',
				wallet_mnemonic: '={{$credentials.walletMnemonic}}',
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
