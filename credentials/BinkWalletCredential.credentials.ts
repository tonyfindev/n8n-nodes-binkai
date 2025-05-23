import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';



export class BinkWalletCredentials implements ICredentialType {
	name = 'binkWalletCredentials';
	displayName = 'Bink Base Wallet Mnemonic';
	properties: INodeProperties[] = [
		{
			displayName: 'Wallet Mnemonic',
			name: 'mnemonic',
			type: 'string',
			description: 'The mnemonic of the wallet to use for the agent',
			required: true,
			typeOptions: {
				password: true,
			},
			default: '',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			qs: {
				wallet_mnemonic: '={{$credentials.mnemonic}}',
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