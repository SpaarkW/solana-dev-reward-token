# Devnet Bitcoin Treasury Machine (DBTM) Token Deployment

This repository contains a script to deploy an SPL Token on Solana's devnet with a 5% transfer tax mechanism and proper metadata. The token uses Solana's Token-2022 program which includes the Transfer Fee extension.

## Features

- Creates a token with 5% transfer fee on all transactions
- Deploys with proper metadata and token image
- Mints 1 billion tokens to the deployer
- Sets up a dedicated tax collection wallet
- Removes mint authority to fix total supply
- Comprehensive logging and information saving

## Prerequisites

- Node.js (v14 or higher)
- NPM or Yarn package manager
- Solana CLI tools (recommended)

## Installation

1. Clone this repository:
   ```
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Configuration

The script is pre-configured with the following token properties:

- **Token Name**: Devnet Bitcoin Treasury Machine
- **Token Symbol**: DBTM
- **Decimals**: 9
- **Total Supply**: 1,000,000,000 tokens
- **Transfer Tax**: 5% (500 basis points)
- **Token URI**: Points to the token image/metadata

You can modify these properties by editing the variables at the top of the script.

## Usage

1. Make sure you have SOL in your wallet (for devnet deployment):
   ```
   solana airdrop 2 <your-wallet-address> --url devnet
   ```

2. Run the deployment script:
   ```
   node deploy.js
   ```

3. The script will:
   - Use an existing keypair or generate a new one
   - Create a new wallet for tax collection
   - Deploy the token with transfer fee extension and metadata
   - Mint the total supply to the deployer
   - Remove mint authority to fix the supply
   - Save all information to `token_info.json` and `wallet_info.json`

## Output Files

After running the script, you'll get:

- **token_info.json**: Contains all token details including address, metadata, etc.
- **token_wallets.json**: Contains the deployer and tax wallet information
- **wallet_info.json**: Copy of wallet information for compatibility

## Important Notes

- **SECURITY WARNING**: The script saves private keys to files for development purposes. In production, use a proper key management system.
- This token uses the TOKEN-2022 program, which includes proper transfer fee functionality.
- When users transfer tokens, 5% will be automatically withheld.
- The tax wallet can collect withheld fees using the withdraw withheld tokens command.

## Transfer Fee Mechanism

The token uses Solana's native Transfer Fee extension which:
- Automatically withholds 5% of every transfer
- Collects the fees in a separate "withheld" account
- Allows the tax wallet to withdraw these fees on demand

## Example Usage After Deployment

To check your token balance:
