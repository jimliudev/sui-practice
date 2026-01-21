# xEstate Deployment Guide

## Prerequisites

- Sui CLI installed and configured
- Sui wallet with testnet SUI tokens
- Node.js and npm installed

## Step 1: Deploy Smart Contracts

### 1.1 Build the contracts

```bash
cd /Users/jim/Desktop/sui-practice/xEstate/move
sui move build
```

### 1.2 Publish to testnet

```bash
sui client publish --gas-budget 100000000
```

**Save the following from the output:**
- Package ID (e.g., `0x1234...`)
- eTUSDC Treasury object ID
- CompanyRegistry object ID

### 1.3 Update frontend configuration

Edit `frontend/src/pages/CompanyRegistration.tsx`:

```typescript
const PACKAGE_ID = '0x...'; // Replace with your package ID
```

Create `frontend/.env`:

```env
VITE_PACKAGE_ID=0x...
VITE_REGISTRY_ID=0x...
VITE_ETUSDC_TREASURY_ID=0x...
```

## Step 2: Test Smart Contracts

### 2.1 Register a test company

```bash
sui client call \
  --package $PACKAGE_ID \
  --module real_estate_platform \
  --function register_company \
  --args $REGISTRY_ID "Test Company" \
  --gas-budget 10000000
```

### 2.2 Verify registration

```bash
sui client object $REGISTRY_ID
```

## Step 3: Deploy Frontend

### 3.1 Build for production

```bash
cd /Users/jim/Desktop/sui-practice/xEstate/frontend
npm run build
```

### 3.2 Deploy to hosting

**Option A: Vercel**

```bash
npm install -g vercel
vercel --prod
```

**Option B: Netlify**

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

**Option C: GitHub Pages**

```bash
npm install -g gh-pages
npm run build
gh-pages -d dist
```

## Step 4: Configure DeepBook

### 4.1 Get DEEP tokens

For testnet, you can get DEEP tokens from the faucet or swap SUI for DEEP.

### 4.2 Create a test pool

Reference: `/Users/jim/Desktop/sui-practice/Deepbook/src/createPool.ts`

```typescript
// After deploying a property and getting its token type
const poolConfig = {
  baseCoinKey: 'ETOKEN_PROPERTY_1',
  quoteCoinKey: 'ETUSDC',
  tickSize: 0.001,
  lotSize: 0.1,
  minSize: 1,
  customCoins: {
    'ETOKEN_PROPERTY_1': {
      address: PACKAGE_ID,
      type: `${PACKAGE_ID}::property_token::ETOKEN_PROPERTY_1`,
      scalar: 1e9,
    }
  }
};
```

## Step 5: Testing the Platform

### 5.1 Test Company Registration

1. Open the deployed frontend
2. Click "For Companies"
3. Connect Sui wallet
4. Enter company name
5. Sign transaction
6. Verify registration in dashboard

### 5.2 Test Property Listing

1. Go to company dashboard
2. Click "List New Property"
3. Fill in property details
4. Ensure you have enough USDC for collateral
5. Submit transaction
6. Verify NFT and tokens created

### 5.3 Test Trading

1. Navigate to "For Investors"
2. Browse listed properties
3. Click on a property to trade
4. Place buy/sell orders
5. Verify trades on DeepBook

## Troubleshooting

### Issue: Transaction fails with "Insufficient gas"

**Solution:** Increase gas budget:
```bash
--gas-budget 100000000
```

### Issue: "Package not found"

**Solution:** Verify package ID is correct and published to the right network.

### Issue: "Object not found"

**Solution:** Ensure you're using the correct object IDs from deployment output.

### Issue: DeepBook pool creation fails

**Solution:** 
- Ensure you have 100 DEEP tokens
- Verify coin types are registered correctly
- Check tick size, lot size, and min size parameters

## Monitoring

### View transactions

```bash
sui client transactions --address $YOUR_ADDRESS
```

### View objects

```bash
sui client objects $YOUR_ADDRESS
```

### Check balance

```bash
sui client balance
```

## Security Considerations

1. **Private Keys:** Never commit private keys or mnemonics
2. **Package IDs:** Store in environment variables
3. **USDC Collateral:** Verify amounts before transactions
4. **Testing:** Always test on testnet first

## Next Steps

1. Deploy to mainnet (when ready)
2. Set up monitoring and analytics
3. Implement additional features
4. Conduct security audit

## Support

For issues during deployment:
1. Check Sui Explorer for transaction details
2. Review error messages in console
3. Verify all prerequisites are met
4. Check network connectivity

---

**Important:** Always test thoroughly on testnet before deploying to mainnet!
