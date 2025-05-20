import { NetworksConfig, NetworkType } from '@binkai/core';

export interface RpcUrls {
	BNB: string;
	ETH: string;
	SOL: string;
}

export const getNetworksConfig = (rpcUrls: RpcUrls): NetworksConfig['networks'] => ({
	bnb: {
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
	ethereum: {
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
	solana: {
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
