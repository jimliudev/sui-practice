# AnchorStone Backend

Backend service for automated property tokenization on Sui blockchain.

## Features

- 🏠 Automated PropertyNFT minting
- 🪙 Dynamic token contract deployment per property
- 🏦 Vault creation and management
- 🔄 RESTful API for frontend integration

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required configuration:
- `SUI_PRIVATE_KEY`: Your Sui wallet private key (for deploying contracts)
- `MAIN_PACKAGE_ID`: Main AnchorStone contract package ID
- `TOKEN_REGISTRY_ID`: TokenRegistry shared object ID

### 3. Get Your Private Key

```bash
# Export your private key
sui keytool export --key-identity <your-address>

# Copy the output (without 0x prefix) to .env
```

### 4. Deploy Main Contract (First Time Only)

```bash
cd ../move
sui client publish --gas-budget 100000000

# 1. 安装依赖
cd backend
npm install

# 2. 配置环境
cp .env.example .env
# 编辑 .env，填入私钥和包 ID

# 3. 启动服务
npm start

# 4. 测试部署
curl -X POST http://localhost:3000/api/properties \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Property","propertyValue":5000000000,"location":"Taipei"}'
```

Record the `PACKAGE_ID` and `TOKEN_REGISTRY_ID` in your `.env` file.

## Usage

### Start the Server

```bash
npm start
```

The server will run on `http://localhost:3000`.

### API Endpoints

#### Create Property (Deploy Token & Create Vault)

```bash
POST /api/properties
Content-Type: application/json

{
  "name": "Taipei Suite A1",
  "description": "Luxury suite in Xinyi District with city view",
  "imageUrl": "https://example.com/image.jpg",
  "propertyValue": 5000000000,
  "location": "Taipei, Taiwan",
  "reserveAmount": 1000000000,
  "totalSupply": 100000000000
}
```

Response:
```json
{
  "success": true,
  "property": {
    "id": "prop_1234567890",
    "name": "Taipei Suite A1",
    "nftId": "0x...",
    "vaultId": "0x...",
    "packageId": "0x...",
    "treasuryCapId": "0x...",
    "tokenType": "0x...::property_token_xxx::PROPERTY_TOKEN_XXX",
    "symbol": "TPSUITA1",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Get All Properties

```bash
GET /api/properties
```

#### Get Property by ID

```bash
GET /api/properties/:id
```

#### Health Check

```bash
GET /health
```

## How It Works

### Deployment Flow

```
1. API receives property data
   ↓
2. Generate unique token contract from template
   ↓
3. Deploy contract to Sui
   ↓
4. Extract TreasuryCap ID
   ↓
5. Mint PropertyNFT
   ↓
6. Prepare reserve coin
   ↓
7. Create Vault with TreasuryCap
   ↓
8. Return all IDs to frontend
```

### Token Contract Generation

Each property gets its own token contract:
- **Module**: `property_token_{id}_{timestamp}`
- **Struct**: `PROPERTY_TOKEN_{ID}_{TIMESTAMP}`
- **Symbol**: First 10 chars of property name (uppercase)

### Files Structure

```
backend/
├── deployProperty.js       # Main deployment logic
├── server.js              # Express API server
├── package.json
├── .env.example
└── templates/
    └── property_token_template.move  # Token contract template
```

## Development

### Run in Development Mode

```bash
npm run dev
```

Uses `nodemon` to auto-restart on file changes.

### Test Deployment Script Directly

```bash
npm run deploy
```

This will run the deployment script with example data.

## Production Considerations

1. **Database**: Replace in-memory storage with PostgreSQL/MongoDB
2. **Queue System**: Use Bull/Redis for async deployment jobs
3. **Error Handling**: Add retry logic for failed deployments
4. **Monitoring**: Add logging and alerting
5. **Security**: 
   - Store private keys in secure vault (AWS Secrets Manager, Azure Key Vault)
   - Add API authentication
   - Rate limiting
6. **Gas Management**: Monitor and refill deployer wallet balance

## Troubleshooting

### "SUI_PRIVATE_KEY not set"
- Make sure you created `.env` file from `.env.example`
- Export your key using `sui keytool export`

### "MAIN_PACKAGE_ID not set"
- Deploy the main contract first using `sui client publish`
- Add the package ID to `.env`

### Deployment fails
- Check gas balance: `sui client gas`
- Verify network connection: `sui client active-env`
- Check Move.toml configuration

## License

MIT
