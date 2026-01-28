# AnchorStone - RWA Tokenization Platform

A protocol for tokenizing and anchoring real-world assets on the Sui blockchain.

## Architecture Overview

AnchorStone is built on a three-layer architecture designed for security, stability, and rapid deployment:

### 🏦 Financial Layer
- **1000 USDC Dual-Purpose Collateral**
  - Market Making: Provides liquidity for asset trading
  - Liquidation Margin: Ensures system solvency and risk management
  - Enables efficient price discovery and trading execution

### 🛡️ Defense Layer
- **3-Hour Price Monitoring**: Continuous surveillance of asset prices to detect anomalies
- **DenyList Circuit Breaker**: Automatic trading suspension for flagged addresses or suspicious activity
- **1:1 Vault Redemption**: Guaranteed backing with real-world assets for token holders

### 🎨 Frontend Layer
- **Vite + React Stack**: Modern, fast development and deployment
- **Rapid Delivery**: Quick iteration and feature rollout
- **User-Friendly Interface**: Seamless asset tokenization and trading experience

## Project Structure

```
AnchorStone/
├── move/                    # Move smart contracts
│   ├── sources/
│   │   ├── anchorstone.move # Main RWA vault module
│   │   └── roof_token.move  # Fractional token module
│   └── Move.toml
│
└── frontend/                # Vite + React frontend
    ├── src/
    │   ├── components/      # UI components
    │   ├── hooks/           # Custom React hooks
    │   ├── utils/           # Utility functions
    │   ├── App.jsx
    │   └── main.jsx
    └── package.json
```

## Smart Contracts

### PropertyNFT
Represents a real-world asset with metadata:
- Name, description, location
- Property value (in USDC)
- Image URL (stored on Walrus/IPFS)
- Creation timestamp

### RwaVault
Manages the tokenization of PropertyNFT:
- Locks the underlying PropertyNFT
- Holds TreasuryCap for fractional tokens
- Manages USDC reserve funds
- Tracks total token supply and liquidation status

### ROOF Token
Fractional ownership tokens created via One-Time-Witness pattern.

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Sui CLI installed
- Sui Wallet browser extension

### 1. Deploy Smart Contracts

```bash
cd move
sui client publish --gas-budget 100000000
```

Save the package ID from the deployment output.

### 2. Setup Frontend

```bash
cd frontend
npm install
```

Create `.env` file:
```env
VITE_SUI_NETWORK=testnet
VITE_PACKAGE_ID=<your_package_id>
VITE_WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
```

### 3. Run Development Server

```bash
npm run dev
```

Open http://localhost:5173

## Usage Flow

1. **Connect Wallet**: Click "Connect Wallet" to authenticate with Sui Wallet
2. **Fill Property Details**: Enter property information (name, description, value, location)
3. **Upload Image**: Select a property image (max 5MB)
4. **Set Token Parameters**: Configure token supply and reserve amount
5. **Create NFT**: Submit the form to mint PropertyNFT on-chain
6. **View Transaction**: Check transaction status and NFT ID

## Features

### ✅ Implemented
- PropertyNFT minting with metadata
- RwaVault structure with dual-purpose collateral
- Fractional token (ROOF) creation
- Wallet authentication
- Property upload form with validation
- Image upload (base64 encoding)
- Transaction status tracking
- Premium dark theme UI with glassmorphism

### 🚧 Coming Soon
- Walrus decentralized storage integration
- Vault creation with USDC deposit
- Token minting interface
- Price monitoring system
- DenyList circuit breaker
- 1:1 redemption mechanism
- DeepBook integration for trading

## Development

### Build for Production

```bash
cd frontend
npm run build
```

### Test Smart Contracts

```bash
cd move
sui move test
```

## Technical Stack

**Smart Contracts:**
- Move language
- Sui blockchain

**Frontend:**
- Vite
- React
- @mysten/sui (Sui TypeScript SDK)
- @mysten/dapp-kit (Wallet integration)
- @tanstack/react-query (Data fetching)
- react-hook-form (Form management)

**Storage:**
- Walrus (decentralized storage for images)

## Security Considerations

- All transactions require user approval via wallet
- Smart contracts use proper access control (owner checks)
- Image files are validated (type, size)
- Form inputs are validated before submission
- Treasury caps are properly managed

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.