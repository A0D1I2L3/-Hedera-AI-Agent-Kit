// create-topic.js - Create HCS Topic for A2A Communication
const {
  Client,
  TopicCreateTransaction,
  PrivateKey,
} = require("@hashgraph/sdk");
require("dotenv").config();

async function createA2ATopic() {
  try {
    console.log("\n🚀 Creating A2A Communication Topic on Hedera Testnet\n");

    // Clean up the private key
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

    // Create topic with submit key (allows only authorized agents to post)
    const transaction = await new TopicCreateTransaction()
      .setSubmitKey(client.operatorPublicKey)
      .setTopicMemo("A2A Communication Topic - Travel Agent Network")
      .setAdminKey(client.operatorPublicKey)
      .execute(client);

    const receipt = await transaction.getReceipt(client);
    const topicId = receipt.topicId;

    console.log(`✅ Topic Created Successfully!`);
    console.log(`\n📋 Topic Details:`);
    console.log(`   Topic ID: ${topicId}`);
    console.log(`   Network: Testnet`);
    console.log(`   Submit Key: Set (authorized agents only)`);
    console.log(`   Admin Key: Set (you can manage topic)`);
    console.log(`   Transaction: ${transaction.transactionId.toString()}`);

    console.log(`\n🔗 View on HashScan:`);
    console.log(`   https://hashscan.io/testnet/topic/${topicId}`);

    console.log(`\n⚙️  Add to your .env file:`);
    console.log(`   A2A_TOPIC_ID=${topicId}`);

    console.log(`\n💡 Next Steps:`);
    console.log(`   1. Add the topic ID to your .env file`);
    console.log(`   2. Run: node a2a-agent.js`);
    console.log(`   3. Send A2A messages: "a2a send <message>"\n`);
  } catch (error) {
    console.error("❌ Failed to create topic:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

createA2ATopic();
