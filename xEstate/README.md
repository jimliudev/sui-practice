# xEstate - Real Estate Tokenization Platform

> Tokenize real estate properties on Sui blockchain with fractional ownership and DeepBook trading

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Sui](https://img.shields.io/badge/Sui-Blockchain-blue)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## 🌟 Overview

xEstate is a decentralized platform for tokenizing real estate properties on the Sui blockchain. Companies can list properties as NFTs, fractionalize them into tradable tokens, and investors can trade these tokens on DeepBook DEX using eTUSDC (USDC vouchers).

### Key Features

- 🏢 **Company Registration** - Register companies to list properties
- 🏠 **Property NFTs** - Unique NFTs for each real estate asset
- 💎 **Fractional Tokens** - Split properties into tradable tokens (Etoken)
- 💰 **USDC Collateralization** - Companies deposit USDC to back tokens
- 📊 **DeepBook Trading** - Trade Etoken/eTUSDC pairs on DeepBook
- 🔄 **eTUSDC Vouchers** - 1:1 redeemable USDC vouchers for trading

## 🏗️ Architecture

### Smart Contracts (Sui Move)

```
move/
├── Move.toml
└── sources/
    ├── etusdc.move                 # eTUSDC voucher token
    └── real_estate_platform.move   # Core platform logic
```

#### eTUSDC Module

A 1:1 redeemable USDC voucher token used as quote currency in trading pools.

```move
// Mint eTUSDC by depositing USDC
public fun mint_etusdc(treasury: &mut ETUSDCTreasury, usdc: Coin<USDC>) -> Coin<ETUSDC>

// Redeem USDC by burning eTUSDC
public fun redeem_usdc(treasury: &mut ETUSDCTreasury, etusdc: Coin<ETUSDC>) -> Coin<USDC>
```

#### Real Estate Platform Module

Core functionality for property tokenization:

- **CompanyRegistry** - Manages registered companies
- **RealEstateNFT** - Property NFTs with metadata
- **PropertyToken<T>** - Fractional token wrapper with USDC collateral
- **Atomic Listing** - Creates NFT + mints tokens + locks USDC in one transaction

```move
// Atomically create property NFT and mint fractional tokens
public fun create_property_with_tokens<T>(
    registry: &mut CompanyRegistry,
    witness: T,
    // ... property details
    total_tokens: u64,
    usdc_collateral: Coin<USDC>,
    usdc_per_token: u64,
    // ...
) -> (RealEstateNFT, PropertyToken<T>, Coin<T>)
```

### Frontend (Vite + React + TypeScript)

```
frontend/
├── src/
│   ├── App.tsx              # Main app with routing
│   ├── main.tsx             # Entry point
│   ├── styles/
│   │   └── index.css        # Global styles & design system
│   └── pages/
│       ├── LandingPage.tsx          # Home page
│       ├── CompanyRegistration.tsx  # Company signup
│       ├── CompanyDashboard.tsx     # Company dashboard
│       ├── PropertyListing.tsx      # List new property
│       ├── PropertyBrowsing.tsx     # Browse properties
│       └── TradingInterface.tsx     # Trade tokens
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Sui CLI](https://docs.sui.io/build/install)
- [Sui Wallet](https://chrome.google.com/webstore/detail/sui-wallet)

### Installation

1. **Clone the repository**

```bash
cd /Users/jim/Desktop/sui-practice/xEstate
```

2. **Install frontend dependencies**

```bash
cd frontend
npm install
```

3. **Build smart contracts**

```bash
cd ../move
sui move build
```

### Running Locally

#### Start Frontend Dev Server

```bash
cd frontend
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173)

#### Deploy Smart Contracts (Testnet)

```bash
cd move
sui client publish --gas-budget 100000000
```

After deployment, update `PACKAGE_ID` in:
- `frontend/src/pages/CompanyRegistration.tsx`
- Other frontend files that interact with contracts

## 📖 Usage

### For Companies

1. **Register Company**
   - Connect Sui wallet
   - Navigate to "For Companies"
   - Enter company name and register

2. **List Property**
   - Go to company dashboard
   - Click "List New Property"
   - Fill in property details:
     - Name, description, location
     - Total tokens to mint
     - Tokens for sale
     - USDC per token (collateral ratio)
   - Upload documents and images
   - Deposit required USDC
   - Submit transaction

3. **Manage Properties**
   - View all listed properties
   - Track token sales
   - Monitor USDC collateral

### For Investors

1. **Browse Properties**
   - Navigate to "For Investors"
   - View available properties
   - Check token availability and prices

2. **Trade Tokens**
   - Select a property
   - View DeepBook order book
   - Place buy/sell orders using eTUSDC
   - Trade fractional ownership

3. **Redeem eTUSDC**
   - Convert eTUSDC back to USDC
   - 1:1 redemption ratio

## 🎨 Design System

### Color Palette

```css
--color-primary: hsl(250, 100%, 65%)      /* Purple */
--color-secondary: hsl(180, 100%, 50%)    /* Cyan */
--color-accent: hsl(320, 100%, 60%)       /* Magenta */
--color-bg-primary: hsl(240, 15%, 8%)     /* Dark background */
```

### Components

- **Glassmorphism Cards** - Frosted glass effect with blur
- **Gradient Buttons** - Vibrant gradients with hover effects
- **Animated Backgrounds** - Floating gradient orbs
- **Responsive Grid** - Mobile-first layout system

## 🔧 Configuration

### Environment Variables

Create `.env` in `frontend/`:

```env
VITE_SUI_NETWORK=testnet
VITE_PACKAGE_ID=0x...  # Your deployed package ID
```

### DeepBook Integration

Reference the existing DeepBook implementation:

```typescript
// See: /Users/jim/Desktop/sui-practice/Deepbook/src/createPool.ts
import { DeepBookClient } from '@mysten/deepbook-v3';

// Register custom Etoken
const customCoins = {
  'ETOKEN_PROPERTY_1': {
    address: '0x...',
    type: '0x...::property_token::ETOKEN_PROPERTY_1',
    scalar: 1e9,
  }
};

// Create pool
dbClient.deepBook.createPermissionlessPool({
  baseCoinKey: 'ETOKEN_PROPERTY_1',
  quoteCoinKey: 'ETUSDC',
  tickSize: 0.001,
  lotSize: 0.1,
  minSize: 1,
})(tx);
```

## 📋 Roadmap

### Phase 1: Foundation ✅
- [x] Smart contract architecture
- [x] Frontend setup with Vite + React
- [x] Landing page and routing
- [x] Company registration
- [x] Premium UI design system

### Phase 2: Core Features 🚧
- [ ] File upload integration (Walrus/IPFS)
- [ ] Complete property listing transaction
- [ ] DeepBook pool creation
- [ ] Property browsing with real data

### Phase 3: Trading 📅
- [ ] DeepBook order placement
- [ ] Order book display
- [ ] eTUSDC redemption
- [ ] Trading history

### Phase 4: Advanced Features 📅
- [ ] Property analytics dashboard
- [ ] Secondary market trading
- [ ] Governance features
- [ ] Mobile app

## 🧪 Testing

### Smart Contracts

```bash
cd move
sui move test
```

### Frontend

```bash
cd frontend
npm run build  # Test production build
```

## 📚 Documentation

- [Implementation Plan](/.gemini/antigravity/brain/fd146451-b255-4e0f-8a01-e6c690e147bd/implementation_plan.md)
- [Walkthrough](/.gemini/antigravity/brain/fd146451-b255-4e0f-8a01-e6c690e147bd/walkthrough.md)
- [Task List](/.gemini/antigravity/brain/fd146451-b255-4e0f-8a01-e6c690e147bd/task.md)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🔗 Resources

- [Sui Documentation](https://docs.sui.io/)
- [DeepBook V3 SDK](https://www.npmjs.com/package/@mysten/deepbook-v3)
- [Sui dApp Kit](https://sdk.mystenlabs.com/dapp-kit)
- [Vite Documentation](https://vitejs.dev/)

## 💡 Support

For questions and support, please open an issue in the repository.

---

Built with ❤️ on Sui Blockchain
