# Sui Practice

A hands-on practice repository for Sui blockchain development.

> Although we are in the age of AI, hands-on experience remains more valuable than AI-generated responses.
> This project represents code I have personally written and verified to work correctly.

## Project Overview

This repository contains practical examples and demos for building on the Sui blockchain, focusing on real-world use cases and developer experience.

## Projects

| Project | Description | Status |
|---------|-------------|--------|
| [Enoki](./Enoki/) | Web2 login integration with zkLogin & Sponsored Transactions | ✅ Complete |

## Tech Stack & Versions

### Enoki Project

| Package | Version | Description |
|---------|---------|-------------|
| `@mysten/sui` | ^1.0.0 | Sui TypeScript SDK |
| `@mysten/enoki` | ^0.10.0 | Enoki SDK for zkLogin |
| `@mysten/dapp-kit` | ^0.14.0 | Sui dApp UI components |
| `react` | ^18.2.0 | Frontend framework |
| `vite` | ^5.0.0 | Build tool |
| `typescript` | ^5.3.0 | Type safety |

### Network

- **Testnet**: `https://fullnode.testnet.sui.io:443`
- **Mainnet**: `https://fullnode.mainnet.sui.io:443`

## Getting Started

```bash
# Clone the repository
git clone https://github.com/jimliudev/sui-practice.git

# Navigate to a project
cd sui-practice/Enoki

# Install dependencies
npm install

# Start development server
npm run dev
```

## Documentation

- [Enoki Project README](./Enoki/README.md) - Complete setup guide for zkLogin & Sponsored Transactions
- [Sui Documentation](https://docs.sui.io/)
- [Enoki Documentation](https://docs.enoki.mystenlabs.com/)

## License

MIT