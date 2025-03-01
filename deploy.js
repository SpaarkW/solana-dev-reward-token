// Tax Token Deployment Script for Solana devnet with Metadata
// This script deploys a new SPL Token (using Token‑2022)
// with the Transfer Fee extension and proper metadata

const {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');

const {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  getMintLen,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createSetAuthorityInstruction,
  AuthorityType,
  createInitializeMetadataPointerInstruction,
  LENGTH_SIZE,
  TYPE_SIZE
} = require('@solana/spl-token');

const { 
  createInitializeInstruction, 
  pack
} = require('@solana/spl-token-metadata');

const fs = require('fs');
const readline = require('readline');

// Configure your token properties
const TOKEN_NAME = "Devnet Bitcoin Treasury Machine"; // Updated token name
const TOKEN_SYMBOL = "DBTM"; // Updated token symbol
const TOKEN_DECIMALS = 9;
const TOKEN_SUPPLY = 1_000_000_000; // 1 billion tokens
const TRANSFER_TAX_BPS = 500; // 5% tax (500 basis points)
const TOKEN_DESCRIPTION = "Devnet Bitcoin Treasury Machine"; // Updated description
const TOKEN_URI = "https://i.degencdn.com/ipfs/bafkreihgh6b6jn4ivlskgyw6bqkwp4z7aegiqzxjot735iy7c5ib7m5zyq"; // Token URI from metadata

// Helper function for pausing execution
function keypress() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question('Press Enter to continue...', () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  try {
    console.log(`🚀 Deploying ${TOKEN_NAME} token with ${TRANSFER_TAX_BPS/100}% transfer tax and metadata...`);
    
    // Connect to the Solana network
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    
    // Use existing keypair for deployer or generate a new one
    let deployerKeypair;
    try {
      const keypairData = JSON.parse(fs.readFileSync('/home/toor/.config/solana/id.json', 'utf8'));
      deployerKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    } catch (error) {
      console.log("Couldn't load existing keypair, generating new one...");
      deployerKeypair = Keypair.generate();
    }
    
    const deployerPrivateKey = Buffer.from(deployerKeypair.secretKey).toString('hex');
    console.log(`\n🔑 Deployer Wallet`);
    console.log(`Address: ${deployerKeypair.publicKey.toString()}`);
    
    // Create a new wallet for tax collection
    const taxWalletKeypair = Keypair.generate();
    const taxWalletPrivateKey = Buffer.from(taxWalletKeypair.secretKey).toString('hex');
    console.log(`\n💰 Tax Wallet Created`);
    console.log(`Address: ${taxWalletKeypair.publicKey.toString()}`);
    
    // IMPORTANT: Save these keys to a secure location - DEV ONLY
    const walletInfo = {
      deployer: {
        publicKey: deployerKeypair.publicKey.toString(),
        privateKey: deployerPrivateKey
      },
      taxWallet: {
        publicKey: taxWalletKeypair.publicKey.toString(),
        privateKey: taxWalletPrivateKey
      }
    };
    
    fs.writeFileSync('token_wallets.json', JSON.stringify(walletInfo, null, 2));
    console.log(`\n📝 Wallet information saved to token_wallets.json`);
    
    // Check deployer balance
    const balance = await connection.getBalance(deployerKeypair.publicKey);
    console.log(`\n💰 Deployer balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    
    if (balance < LAMPORTS_PER_SOL * 0.5) {
      console.log(`\n⚠️ Warning: Low balance. You may need more SOL for deployment.`);
      console.log(`Requesting airdrop for deployer...`);
      
      try {
        const airdropSignature = await connection.requestAirdrop(
          deployerKeypair.publicKey,
          LAMPORTS_PER_SOL
        );
        await connection.confirmTransaction(airdropSignature, 'confirmed');
        
        const newBalance = await connection.getBalance(deployerKeypair.publicKey);
        console.log(`✅ Airdrop confirmed. New balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);
      } catch (error) {
        console.log(`⚠️ Airdrop failed. You may need to manually fund your wallet.`);
        console.log(`On devnet, you can use: solana airdrop 2 ${deployerKeypair.publicKey.toString()}`);
      }
    }
    
    // Generate a new keypair for the token mint
    console.log(`\n🏦 Creating token mint with transfer fee extension and metadata...`);
    const mintKeypair = Keypair.generate();
    
    // Set a high max fee so the fee is always 5% for normal transfers
    // For any transfers, fee will be min(feeBasisPoints * amount / 10000, maxFee)
    const maxFee = BigInt(TOKEN_SUPPLY * Math.pow(10, TOKEN_DECIMALS) * 0.05); // 5% of total supply
    
    // Define metadata for the token
    const metadata = {
      mint: mintKeypair.publicKey,
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      uri: TOKEN_URI,
      additionalMetadata: [['description', TOKEN_DESCRIPTION]]
    };
    
    // Calculate the required space for the mint account including all extensions
    const extensions = [ExtensionType.TransferFeeConfig, ExtensionType.MetadataPointer];
    const mintLen = getMintLen(extensions);
    
    // Calculate the metadata length
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
    
    // Get the minimum balance for rent exemption
    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);
    
    // Build instructions:
    // 1. Create the mint account with the required space and rent exemption
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: deployerKeypair.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });
    
    // 2. Initialize the transfer fee extension on the mint
    const initializeTransferFeeConfigIx = createInitializeTransferFeeConfigInstruction(
      mintKeypair.publicKey,           // Mint account
      null,       // Transfer fee config authority
      taxWalletKeypair.publicKey,      // Withdraw withheld tokens authority
      TRANSFER_TAX_BPS,                // Fee basis points (5%)
      maxFee,                          // Maximum fee in token units
      TOKEN_2022_PROGRAM_ID            // Token‑2022 program ID
    );
    
    // 3. Initialize the metadata pointer
    const initMetadataPointerIx = createInitializeMetadataPointerInstruction(
      mintKeypair.publicKey,           // Mint account
      deployerKeypair.publicKey,       // Authority
      mintKeypair.publicKey,           // Metadata address (using the mint itself)
      TOKEN_2022_PROGRAM_ID            // Program ID
    );
    
    // 4. Initialize the mint normally (with no freeze authority)
    const initializeMintIx = createInitializeMintInstruction(
      mintKeypair.publicKey,           // Mint account
      TOKEN_DECIMALS,                  // Number of decimals
      deployerKeypair.publicKey,       // Mint authority
      null,                            // Freeze authority (none)
      TOKEN_2022_PROGRAM_ID            // Token‑2022 program ID
    );
    
    // 5. Initialize the metadata
    const initializeMetadataIx = createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      mint: mintKeypair.publicKey,
      metadata: mintKeypair.publicKey,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
      mintAuthority: deployerKeypair.publicKey,
      updateAuthority: deployerKeypair.publicKey,
      additionalMetadata: metadata.additionalMetadata
    });

    // Create a transaction and add the instructions
    let tx = new Transaction().add(
      createAccountIx,
      initializeTransferFeeConfigIx,
      initMetadataPointerIx,
      initializeMintIx,
      initializeMetadataIx
    );
    
    // Set recent blockhash and fee payer
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = deployerKeypair.publicKey;
    
    // Sign and send the transaction
    console.log(`Sending transaction to deploy token mint with Transfer Fee extension and metadata...`);
    const signature = await sendAndConfirmTransaction(
      connection, 
      tx, 
      [deployerKeypair, mintKeypair], 
      { commitment: 'confirmed' }
    );
    
    console.log(`\n✅ Token mint created with transfer fee extension and metadata: ${mintKeypair.publicKey.toString()}`);
    console.log(`Transaction signature: ${signature}`);
    
    // Create token accounts for the deployer and tax wallet
    console.log(`\n👛 Creating token accounts...`);
    
    // Get the associated token account addresses
    const deployerTokenAddress = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      deployerKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    const taxTokenAddress = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      taxWalletKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create the token accounts
    const createDeployerTokenAccIx = createAssociatedTokenAccountInstruction(
      deployerKeypair.publicKey,       // Payer
      deployerTokenAddress,            // Associated token account address
      deployerKeypair.publicKey,       // Owner
      mintKeypair.publicKey,           // Mint
      TOKEN_2022_PROGRAM_ID            // Program ID
    );
    
    const createTaxTokenAccIx = createAssociatedTokenAccountInstruction(
      deployerKeypair.publicKey,       // Payer
      taxTokenAddress,                 // Associated token account address
      taxWalletKeypair.publicKey,      // Owner
      mintKeypair.publicKey,           // Mint
      TOKEN_2022_PROGRAM_ID            // Program ID
    );
    
    // Create instruction to mint tokens to the deployer
    const mintToDeployerIx = createMintToInstruction(
      mintKeypair.publicKey,           // Mint
      deployerTokenAddress,            // Destination
      deployerKeypair.publicKey,       // Mint authority
      TOKEN_SUPPLY * Math.pow(10, TOKEN_DECIMALS), // Amount
      [],                              // Multi-signers
      TOKEN_2022_PROGRAM_ID            // Program ID
    );
    
    // Create a new transaction for token accounts and minting
    tx = new Transaction().add(
      createDeployerTokenAccIx,
      createTaxTokenAccIx,
      mintToDeployerIx
    );
    
    // Update blockhash
    const { blockhash: newBlockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = newBlockhash;
    tx.feePayer = deployerKeypair.publicKey;
    
    // Send the transaction
    console.log(`\n💵 Minting ${TOKEN_SUPPLY.toLocaleString()} tokens to deployer...`);
    const mintSignature = await sendAndConfirmTransaction(
      connection, 
      tx, 
      [deployerKeypair], 
      { commitment: 'confirmed' }
    );
    
    console.log(`\n✅ Tokens minted successfully!`);
    console.log(`Transaction signature: ${mintSignature}`);
  
    
    // ===== Remove Mint Authority to make the supply fixed =====
    console.log(`\n🔒 Removing mint authority to fix token supply...`);
    
    // Create the instruction to revoke mint authority
    const removeMintAuthorityIx = createSetAuthorityInstruction(
      mintKeypair.publicKey,           // Mint account
      deployerKeypair.publicKey,       // Current authority
      AuthorityType.MintTokens,        // Authority type to set
      null,                            // New authority (null = revoke)
      [],                              // Multi-signers
      TOKEN_2022_PROGRAM_ID            // Program ID
    );
    
    // Create and send transaction to remove mint authority
    tx = new Transaction().add(removeMintAuthorityIx);
    
    // Update blockhash
    const { blockhash: revokeBlockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = revokeBlockhash;
    tx.feePayer = deployerKeypair.publicKey;
    
    // Send the transaction
    const revokeMintSignature = await sendAndConfirmTransaction(
      connection, 
      tx, 
      [deployerKeypair], 
      { commitment: 'confirmed' }
    );
    
    console.log(`\n✅ Mint authority removed successfully!`);
    console.log(`Transaction signature: ${revokeMintSignature}`);
    
    // Save token information to file
    const tokenInfo = {
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      mint: mintKeypair.publicKey.toString(),
      decimals: TOKEN_DECIMALS,
      deployer: deployerKeypair.publicKey.toString(),
      taxWallet: taxWalletKeypair.publicKey.toString(),
      transfer_tax_bps: TRANSFER_TAX_BPS,
      program_id: TOKEN_2022_PROGRAM_ID.toString(),
      metadata: {
        metadataPointer: {
          authority: deployerKeypair.publicKey.toString(),
          metadataAddress: mintKeypair.publicKey.toString()
        },
        tokenMetadata: {
          mint: mintKeypair.publicKey.toString(),
          name: TOKEN_NAME,
          symbol: TOKEN_SYMBOL,
          uri: TOKEN_URI,
          updateAuthority: deployerKeypair.publicKey.toString(),
          additionalMetadata: [['description', TOKEN_DESCRIPTION]]
        }
      }
    };
    
    fs.writeFileSync('token_info.json', JSON.stringify(tokenInfo, null, 2));
    console.log(`\n📝 Token information saved to token_info.json`);
    
    // Also create a copy with the name wallet_info.json for compatibility with rewards.js
    fs.writeFileSync('wallet_info.json', JSON.stringify(walletInfo, null, 2));
    console.log(`\n📝 Wallet information also saved to wallet_info.json for rewards.js compatibility`);
    
    console.log(`\n🎉 Deployment Complete!`);
    console.log(`\nToken Summary:`);
    console.log(`--------------------------------------------------`);
    console.log(`Token Name:       ${TOKEN_NAME}`);
    console.log(`Token Symbol:     ${TOKEN_SYMBOL}`);
    console.log(`Token Address:    ${mintKeypair.publicKey.toString()}`);
    console.log(`Token Program:    ${TOKEN_2022_PROGRAM_ID.toString()}`);
    console.log(`Token Decimals:   ${TOKEN_DECIMALS}`);
    console.log(`Total Supply:     ${TOKEN_SUPPLY.toLocaleString()}`);
    console.log(`Tax Rate:         ${TRANSFER_TAX_BPS/100}%`);
    console.log(`Token URI:        ${TOKEN_URI}`);
    console.log(`--------------------------------------------------`);
    console.log(`Deployer Address: ${deployerKeypair.publicKey.toString()}`);
    console.log(`Tax Wallet:       ${taxWalletKeypair.publicKey.toString()}`);
    console.log(`--------------------------------------------------`);
    console.log(`\nNOTE: This token uses the TOKEN-2022 program which includes a proper transfer fee extension.`);
    console.log(`When users transfer tokens, ${TRANSFER_TAX_BPS/100}% will be automatically withheld.`);
    console.log(`The tax wallet can collect withheld fees using the withdraw withheld tokens command.`);
    console.log(`\nThe token has been deployed with proper metadata using the MetadataPointer extension.`);
    
  } catch (error) {
    console.error(`\n❌ Deployment failed:`, error);
    console.error(`Error details:`, error.message);
  }
}

main();