import { NetworksConfig, NetworkType } from '@binkai/core';

export enum SupportChain {
	BNB = 'bnb',
	ETHEREUM = 'ethereum',
	SOLANA = 'solana',
}

export interface RpcUrls {
	BNB: string;
	ETH: string;
	SOL: string;
}

export const getNetworksConfig = (rpcUrls: RpcUrls): NetworksConfig['networks'] => ({
	[SupportChain.BNB]: {
		type: 'evm' as NetworkType,
		config: {
			chainId: 56,
			rpcUrl: rpcUrls.BNB,
			name: 'BNB Chain',
			nativeCurrency: {
				name: 'BNB',
				symbol: 'BNB',
				decimals: 18,
			},
		},
	},
	[SupportChain.ETHEREUM]: {
		type: 'evm' as NetworkType,
		config: {
			chainId: 1,
			rpcUrl: rpcUrls.ETH,
			name: 'Ethereum',
			nativeCurrency: {
				name: 'Ether',
				symbol: 'ETH',
				decimals: 18,
			},
		},
	},
	[SupportChain.SOLANA]: {
		type: 'solana' as NetworkType,
		config: {
			rpcUrl: rpcUrls.SOL,
			name: 'Solana',
			nativeCurrency: {
				name: 'Solana',
				symbol: 'SOL',
				decimals: 9,
			},
		},
	},
});
