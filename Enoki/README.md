# Enoki SDK Example Project

A complete example demonstrating how to use Mysten Labs Enoki SDK, enabling users to interact with Sui blockchain using Web2 login methods (Google, Apple, etc.).

## Features

- ✅ **Web2 Login Integration** - Use familiar login methods like Google, Facebook
- ✅ **Auto-generated Sui Address** - Automatically create blockchain addresses via zkLogin
- ✅ **Sponsored Transactions** - Developers can pay gas fees for users
- ✅ **Easy to Use** - Users don't need to understand wallets, private keys, or Web3 concepts

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys

Go to [Enoki Portal](https://portal.enoki.mystenlabs.com/) to create your app and get API Keys:

1. Create a new application
2. Generate **Public API Key** (for frontend zkLogin)
3. Configure OAuth providers (Google, Facebook, etc.) and get **Client IDs**
4. Note down each OAuth provider's Client ID

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and fill in your configuration:

```env
VITE_ENOKI_PUBLIC_KEY=your_enoki_public_key_here
VITE_SUI_NETWORK=testnet
```

Then edit `src/components/EnokiWalletRegistration.tsx` to update OAuth Client IDs:

```typescript
providers: {
  google: {
    clientId: 'your-google-client-id.apps.googleusercontent.com',
  },
  facebook: {
    clientId: 'your-facebook-app-id',
  },
}
```

### 3. Start Development Server

```bash
npm run dev
```

## Project Structure

```
Enoki/
├── src/
│   ├── App.tsx                          # Main application component
│   ├── main.tsx                         # Application entry point
│   ├── components/
│   │   ├── LoginPage.tsx                # Login page (custom login buttons)
│   │   ├── Dashboard.tsx                # User dashboard
│   │   ├── TransactionDemo.tsx          # Transaction demo
│   │   ├── SponsoredTransactionDemo.tsx # Sponsored transaction demo
│   │   └── EnokiWalletRegistration.tsx  # Enoki wallet registration
│   ├── lib/
│   │   └── enoki.ts                     # Enoki client configuration
│   └── vite-env.d.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Complete Setup Guide

### Step 1: Google Developer Console - Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Select **Web application** as application type
6. Configure the following:

   **Authorized JavaScript origins:**
   ```
   http://localhost:3000
   ```
   
   **Authorized redirect URIs:**
   ```
   http://localhost:3000/
   ```
   
   > ⚠️ **Important**: The redirect URI should be your **local development URL** (e.g., `http://localhost:3000/`), NOT the Enoki domain. This depends on the SDK method you're using.

7. Click **Create** and note down your **Client ID** (format: `xxx.apps.googleusercontent.com`)

### Step 2: Enoki Portal - Register OAuth Provider

1. Go to [Enoki Portal](https://portal.enoki.mystenlabs.com/)
2. Create a new project or select existing one
3. Navigate to **Authentication** → **OAuth Providers**
4. Click **Add Provider** → Select **Google**
5. Paste your **Google Client ID** from Step 1
6. Save the configuration

### Step 3: Enoki Portal - Generate API Keys

1. In Enoki Portal, go to **API Keys**
2. Generate **Public API Key**:
   - Used in frontend for zkLogin
   - Safe to expose in client-side code
3. Generate **Private API Key** (if using sponsored transactions):
   - Used for backend operations
   - ⚠️ **Never expose in frontend code!**
   - Required for `createSponsoredTransaction` API

### Step 4: Enoki Portal - Configure Sponsored Transactions

1. Navigate to **Sponsored Transactions** section
2. Configure **Allowed Move Call Targets**:
   ```
   0x2::coin::transfer
   0x2::pay::split_and_transfer
   your_package::your_module::your_function
   ```
3. Configure **Allowed Addresses** (optional):
   - Whitelist specific recipient addresses
4. Set **Budget Limits**:
   - Daily limit
   - Monthly limit
   - Per-transaction limit
5. For **Testnet**: Free sponsorship quota provided
6. For **Mainnet**: Deposit SUI to fund the sponsor wallet

### Step 5: Enoki Portal - Set Allowed Origins

1. Navigate to **Settings** → **Allowed Origins**
2. Add your application domains:
   ```
   http://localhost:3000
   http://localhost:5173
   https://your-production-domain.com
   ```
3. This prevents unauthorized domains from using your API keys

### Step 6: Configure Your Application

1. Create `.env` file:
   ```bash
   cp .env.example .env
   ```

2. Add your configuration:
   ```env
   VITE_ENOKI_PUBLIC_KEY=enoki_public_xxxxx
   VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   VITE_SUI_NETWORK=testnet
   ```

3. Update `src/components/EnokiWalletRegistration.tsx`:
   ```typescript
   const { register } = registerEnokiWallets({
     enokiPublicKey: import.meta.env.VITE_ENOKI_PUBLIC_KEY,
     providers: {
       google: {
         clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
       },
     },
   });
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

### Configuration Checklist

| Step | Location | Configuration |
|------|----------|---------------|
| 1 | Google Console | OAuth Client ID, Redirect URIs |
| 2 | Enoki Portal | Register Google Client ID |
| 3 | Enoki Portal | Generate Public/Private API Keys |
| 4 | Enoki Portal | Allowed Move Call Targets, Budget |
| 5 | Enoki Portal | Allowed Origins (localhost, production) |
| 6 | Your App | `.env` file, EnokiWalletRegistration |

---

## Usage

### Basic Login Flow

1. User clicks "Sign in with Google" button
2. Enoki SDK handles OAuth flow
3. Automatically generates a Sui address bound to user's JWT
4. User can start making blockchain transactions

---

## zkLogin

zkLogin is a Sui primitive that enables users to create blockchain accounts using their existing Web2 credentials (Google, Facebook, Apple, etc.) without managing private keys.

### How zkLogin Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User's     │     │    Enoki     │     │     Sui      │
│ Google OAuth │ --> │   zkLogin    │ --> │  Blockchain  │
│    (JWT)     │     │   Service    │     │   Address    │
└──────────────┘     └──────────────┘     └──────────────┘
```

1. **User authenticates** with Google (or other OAuth provider)
2. **OAuth returns JWT** containing user's identity claims
3. **Enoki generates** a deterministic Sui address from the JWT
4. **User can sign transactions** using their OAuth session

### Key Features

- **Self-custodial**: Only the user controls their account
- **No seed phrases**: Users don't need to manage private keys
- **Deterministic addresses**: Same OAuth account = same Sui address (per app)
- **Privacy preserving**: Uses zero-knowledge proofs

### Address Generation

Each user gets a unique Sui address based on:
- OAuth provider (Google, Facebook, etc.)
- User's unique ID from the provider
- Application-specific salt

> **Note**: The same Google account will have different Sui addresses in different applications due to unique salts.

### Implementation with Enoki

```typescript
import { registerEnokiWallets } from '@mysten/enoki';

// Register Enoki wallets with OAuth providers
const { register } = registerEnokiWallets({
  enokiPublicKey: 'your_enoki_public_key',
  providers: {
    google: {
      clientId: 'your_google_client_id.apps.googleusercontent.com',
    },
  },
});

// Register with wallet standard
register();

// Now users can connect using "Sign in with Google" wallet
```

---

## Sponsored Transactions

Sponsored transactions allow developers to pay gas fees for users, enabling a seamless onboarding experience where users don't need to own SUI tokens.

### How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    User     │ --> │   Enoki     │ --> │ Sui Network │
│  (signs tx) │     │ (pays gas)  │     │(executes tx)│
└─────────────┘     └─────────────┘     └─────────────┘
```

1. **Developer** configures sponsored transaction settings in Enoki Portal
2. **User** creates and signs a transaction
3. **Enoki** wraps it with gas payment from the sponsor wallet
4. **Transaction** executes on Sui blockchain with gas paid by Enoki

### Configuration in Enoki Portal

Before using sponsored transactions, configure these settings in [Enoki Portal](https://portal.enoki.mystenlabs.com/):

1. Navigate to your project → **Sponsored Transactions**
2. Configure:
   - **Allowed Move Call Targets**: Whitelist of Move functions that can be sponsored
   - **Allowed Addresses**: Whitelist of recipient addresses
   - **Daily/Monthly Limits**: Budget controls for sponsorship
3. For testnet: Enoki provides free sponsorship quota
4. For mainnet: Deposit SUI to fund the sponsor wallet

### Implementation Flow

#### Step 1: Create Transaction (Transaction Kind Only)

```typescript
import { Transaction } from '@mysten/sui/transactions';
import { toB64 } from '@mysten/sui/utils';

const tx = new Transaction();

// Add your transaction logic (transfer, move call, etc.)
// Example: Transfer user's SUI to another address
const [coin] = tx.splitCoins(tx.object(userCoinId), [amount]);
tx.transferObjects([coin], recipientAddress);

// Build with onlyTransactionKind: true (no gas info)
const txBytes = await tx.build({
  client: suiClient,
  onlyTransactionKind: true,  // Key: only build transaction kind
});
```

#### Step 2: Create Sponsored Transaction via Enoki API

```typescript
import { EnokiClient } from '@mysten/enoki';

const enokiClient = new EnokiClient({
  apiKey: 'your_enoki_api_key',
});

// Create sponsored transaction
// Note: allowedMoveCallTargets should be configured in Enoki Portal, not here
const sponsoredResponse = await enokiClient.createSponsoredTransaction({
  network: 'testnet',
  transactionKindBytes: toB64(txBytes),
  sender: userAddress,
});

// Response contains:
// - bytes: The complete transaction with gas info (base64)
// - digest: Transaction digest for execution
```

#### Step 3: User Signs the Transaction

```typescript
import { useSignTransaction } from '@mysten/dapp-kit';

const { mutateAsync: signTransaction } = useSignTransaction();

// User signs the sponsored transaction
const { signature } = await signTransaction({
  transaction: sponsoredResponse.bytes,  // Pass base64 string directly
});
```

#### Step 4: Execute Sponsored Transaction

```typescript
const executeResponse = await enokiClient.executeSponsoredTransaction({
  digest: sponsoredResponse.digest,
  signature: signature,
});

console.log('Transaction successful:', executeResponse.digest);
```

### Complete Example

```typescript
const handleSponsoredTransfer = async () => {
  // 1. Get user's coins
  const coins = await suiClient.getCoins({
    owner: currentAccount.address,
    coinType: '0x2::sui::SUI',
  });

  // 2. Create transaction
  const tx = new Transaction();
  const amountInMist = BigInt(0.01 * 1_000_000_000); // 0.01 SUI
  
  const coinToUse = coins.data.find(c => BigInt(c.balance) >= amountInMist);
  const [coinToTransfer] = tx.splitCoins(tx.object(coinToUse.coinObjectId), [amountInMist]);
  tx.transferObjects([coinToTransfer], recipientAddress);

  // 3. Build transaction kind only
  const txBytes = await tx.build({
    client: suiClient,
    onlyTransactionKind: true,
  });

  // 4. Create sponsored transaction
  const sponsoredResponse = await enokiClient.createSponsoredTransaction({
    network: 'testnet',
    transactionKindBytes: toB64(txBytes),
    sender: currentAccount.address,
  });

  // 5. User signs
  const { signature } = await signTransaction({
    transaction: sponsoredResponse.bytes,
  });

  // 6. Execute
  const result = await enokiClient.executeSponsoredTransaction({
    digest: sponsoredResponse.digest,
    signature,
  });

  console.log('Success! Digest:', result.digest);
};
```

### Important Notes

| Topic | Description |
|-------|-------------|
| **Security** | Configure `allowedMoveCallTargets` in Enoki Portal, not in frontend code |
| **Production** | Handle sponsorship logic via backend API to protect your API key |
| **Gas Source** | Testnet: Free from Enoki / Mainnet: From your deposited balance |
| **Sponsor Wallet** | Enoki uses their wallet (e.g., `0x0dec4c7d...`) to pay gas |
| **User Tokens** | Users can transfer their own tokens; only gas is sponsored |

---

## Key Concepts

### zkLogin
- Enoki uses zkLogin technology to generate self-custodial Sui addresses
- User addresses are bound to their Web2 credentials (JWT)
- Each app has a different salt, so the same user has different addresses in different apps

### API Keys
- **Public Key**: Used in frontend, enables zkLogin functionality
- **Private Key**: Used in backend, enables sponsored transactions
- ⚠️ Never expose Private Key in frontend code!

## Documentation

- [Enoki Official Docs](https://docs.enoki.mystenlabs.com/)
- [Enoki TypeScript SDK](https://docs.enoki.mystenlabs.com/ts-sdk)
- [Sui Documentation](https://docs.sui.io/)
- [Enoki Portal](https://portal.enoki.mystenlabs.com/)

## License

MIT