# n8n-nodes-binkai

A powerful n8n module that integrates BinkAI functionality for blockchain and Web3 operations. This module enables seamless interaction with various blockchain networks and DeFi protocols through n8n workflows.

## Features

- **Blockchain Operations**

  - Wallet balance checking
  - Token transfers
  - Token swaps
  - Cross-chain bridging
  - Staking operations

- **DeFi Protocol Integration**

  - Jupiter (Solana)
  - PancakeSwap
  - Kyber
  - Thena
  - Venus
  - And more...

- **Additional Capabilities**
  - Image processing
  - Knowledge base integration
  - RPC provider support
  - Multi-chain support

## Prerequisites

- Node.js >= 18.10
- pnpm >= 9.1
- n8n instance

## Installation

1. Install the package in your n8n instance:

```bash
pnpm add n8n-nodes-binkai
```

2. Restart your n8n instance to load the new nodes.

## Usage

After installation, you'll find new nodes in your n8n workflow editor under the "BinkAI" category. These nodes can be used to:

- Perform blockchain transactions
- Interact with DeFi protocols
- Manage digital assets
- Bridge assets between chains
- And more...

## Development

### Setup

1. Clone the repository:

```bash
git clone https://github.com/n8n-io/n8n-nodes-binkai.git
cd n8n-nodes-binkai
```

2. Install dependencies:

```bash
pnpm install
```

### Available Scripts

- `pnpm build` - Build the nodes
- `pnpm dev` - Watch for changes and rebuild
- `pnpm format` - Format the code
- `pnpm lint` - Lint the code
- `pnpm lintfix` - Fix linting issues

## Dependencies

This package integrates with various BinkAI providers and plugins:

- Core blockchain functionality
- Multiple DEX integrations
- Bridge protocols
- Wallet management
- Token operations
- And more...

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.

## Contributing

Contributions are welcome! Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
