// create-insurance-agent.js - Create insurance agent account
const {
  Client,
  PrivateKey,
  AccountCreateTransaction,
  Hbar,
  AccountBalanceQuery,
} = require("@hashgraph/sdk");
require("dotenv").config();

async function createInsuranceAgent() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("🛡️  CREATING INSURANCE AGENT ACCOUNT");
    console.log("=".repeat(70) + "\n");

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

    // Check creator account balance
    console.log("💰 Checking creator account balance...");
    const creatorBalance = await new AccountBalanceQuery()
      .setAccountId(process.env.HEDERA_ACCOUNT_ID)
      .execute(client);

    console.log(`   Creator Account: ${process.env.HEDERA_ACCOUNT_ID}`);
    console.log(`   Balance: ${creatorBalance.hbars} HBAR\n`);

    if (creatorBalance.hbars.toBigNumber().toNumber() < 15) {
      console.error("❌ Insufficient balance!");
      console.log("   Need at least 15 HBAR to create insurance agent");
      console.log("   💡 Get testnet HBAR: https://portal.hedera.com/faucet\n");
      process.exit(1);
    }

    // Generate new keys for insurance agent
    console.log("🔑 Generating cryptographic keys...");
    const newAccountPrivateKey = PrivateKey.generateECDSA();
    const newAccountPublicKey = newAccountPrivateKey.publicKey;

    console.log("   ✓ Keys generated successfully");
    console.log(`   Public Key: ${newAccountPublicKey.toString()}`);
    console.log(`   Private Key: ${newAccountPrivateKey.toString()}\n`);

    // Create new account with initial balance
    console.log("🏗️  Creating Insurance Agent account on Hedera testnet...");
    const newAccountTx = await new AccountCreateTransaction()
      .setKey(newAccountPublicKey)
      .setInitialBalance(Hbar.from(15)) // Start with 15 HBAR for insurance operations
      .setAccountMemo("AI Insurance Agent - Travel Protection")
      .execute(client);

    const receipt = await newAccountTx.getReceipt(client);
    const newAccountId = receipt.accountId;

    console.log("   ✓ Transaction submitted");
    console.log("   ✓ Account created successfully!\n");

    console.log("=".repeat(70));
    console.log("✅ INSURANCE AGENT ACCOUNT CREATED");
    console.log("=".repeat(70) + "\n");

    console.log("📋 Account Details:");
    console.log("   ├─ Account ID: " + newAccountId);
    console.log("   ├─ Initial Balance: 15 HBAR");
    console.log("   ├─ Network: Testnet");
    console.log("   ├─ Memo: AI Insurance Agent - Travel Protection");
    console.log("   └─ Transaction: " + newAccountTx.transactionId.toString());

    console.log("\n🔗 View on HashScan:");
    console.log(`   https://hashscan.io/testnet/account/${newAccountId}`);

    console.log("\n" + "=".repeat(70));
    console.log("⚙️  CONFIGURATION");
    console.log("=".repeat(70) + "\n");

    console.log("Add these to your .env file:\n");
    console.log(`INSURANCE_ACCOUNT_ID=${newAccountId}`);
    console.log(`INSURANCE_PRIVATE_KEY=${newAccountPrivateKey.toString()}`);

    console.log("\n" + "=".repeat(70));
    console.log("🤖 YOUR AGENT ECOSYSTEM");
    console.log("=".repeat(70) + "\n");

    console.log("Active Agents:");
    console.log(`   1. 🧳 Travel Agent:    ${process.env.HEDERA_ACCOUNT_ID}`);

    if (process.env.HOTEL_ACCOUNT_ID) {
      console.log(`   2. 🏨 Hotel Agent:     ${process.env.HOTEL_ACCOUNT_ID}`);
    }

    console.log(`   ${process.env.HOTEL_ACCOUNT_ID ? '3' : '2'}. 🛡️  Insurance Agent: ${newAccountId}`);

    console.log("\n" + "=".repeat(70));
    console.log("💡 WHAT'S NEXT?");
    console.log("=".repeat(70) + "\n");

    console.log("1. Copy the configuration above to your .env file");
    console.log("2. Run the multi-agent system:");
    console.log("   node run-three-agents.js");
    console.log("\n3. Insurance agent will:");
    console.log("   ✓ Offer travel insurance policies");
    console.log("   ✓ Calculate premiums based on trip details");
    console.log("   ✓ Process claims autonomously");
    console.log("   ✓ Handle payments via HBAR\n");

    console.log("🎯 Example Flow:");
    console.log("   User books hotel → Insurance agent offers policy");
    console.log("   → User accepts → Payment processed → Policy issued\n");

    console.log("=".repeat(70) + "\n");

  } catch (error) {
    console.error("\n" + "=".repeat(70));
    console.error("❌ ERROR CREATING INSURANCE AGENT");
    console.error("=".repeat(70) + "\n");
    console.error("Error:", error.message);

    if (error.status) {
      console.error("Status:", error.status.toString());
    }

    console.error("\n💡 Troubleshooting:");
    console.error("   1. Check your .env file has HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY");
    console.error("   2. Ensure you have enough HBAR (need 15+ HBAR)");
    console.error("   3. Verify you're connected to testnet");
    console.error("   4. Get testnet HBAR: https://portal.hedera.com/faucet\n");

    console.error("Full error:");
    console.error(error.stack);
    process.exit(1);
  }
}

createInsuranceAgent();
