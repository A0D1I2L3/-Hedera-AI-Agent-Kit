// create-hotel-agent.js - Create a second account for Hotel Agent
const {
  Client,
  PrivateKey,
  AccountCreateTransaction,
  Hbar,
} = require("@hashgraph/sdk");
require("dotenv").config();

async function createHotelAgent() {
  try {
    console.log("\n🏨 Creating Hotel Agent Account...\n");

    // Connect with your main account
    let privateKeyString = process.env.HEDERA_PRIVATE_KEY.trim();
    privateKeyString = privateKeyString.replace(/^["']|["']$/g, "");
    privateKeyString = privateKeyString.replace(/^0x/i, "");

    let privateKey;
    try {
      privateKey = PrivateKey.fromStringECDSA(privateKeyString);
    } catch (e) {
      privateKey = PrivateKey.fromString(privateKeyString);
    }

    const client = Client.forTestnet().setOperator(
      process.env.HEDERA_ACCOUNT_ID,
      privateKey
    );

    // Generate new keys for hotel agent
    const newAccountPrivateKey = PrivateKey.generateECDSA();
    const newAccountPublicKey = newAccountPrivateKey.publicKey;

    console.log("🔑 Generated new keys for Hotel Agent:");
    console.log(`   Public Key: ${newAccountPublicKey.toString()}`);
    console.log(`   Private Key: ${newAccountPrivateKey.toString()}\n`);

    // Create new account with initial balance
    const newAccountTx = await new AccountCreateTransaction()
      .setKey(newAccountPublicKey)
      .setInitialBalance(Hbar.from(10)) // Start with 10 HBAR
      .execute(client);

    const receipt = await newAccountTx.getReceipt(client);
    const newAccountId = receipt.accountId;

    console.log("✅ Hotel Agent Account Created!");
    console.log(`\n📋 Account Details:`);
    console.log(`   Account ID: ${newAccountId}`);
    console.log(`   Initial Balance: 10 HBAR`);
    console.log(`   Transaction: ${newAccountTx.transactionId.toString()}`);

    console.log(`\n🔗 View on HashScan:`);
    console.log(`   https://hashscan.io/testnet/account/${newAccountId}`);

    console.log(`\n⚙️  Add to your .env file:`);
    console.log(`   HOTEL_ACCOUNT_ID=${newAccountId}`);
    console.log(`   HOTEL_PRIVATE_KEY=${newAccountPrivateKey.toString()}`);

    console.log(`\n💡 Now you have TWO agents:`);
    console.log(`   1. Travel Agent: ${process.env.HEDERA_ACCOUNT_ID}`);
    console.log(`   2. Hotel Agent: ${newAccountId}`);
    console.log(
      `\n✨ They can now communicate and transfer HBAR between each other!\n`
    );
  } catch (error) {
    console.error("❌ Failed to create hotel agent:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

createHotelAgent();
