// update-topic.js - Update topic to allow hotel agent to submit
const {
  Client,
  PrivateKey,
  TopicUpdateTransaction,
  KeyList,
} = require("@hashgraph/sdk");
require("dotenv").config();

async function updateTopic() {
  try {
    console.log("\n🔧 Updating Topic Submit Keys...\n");

    if (!process.env.HOTEL_ACCOUNT_ID || !process.env.HOTEL_PRIVATE_KEY) {
      console.error("❌ Hotel agent not configured!");
      console.log("\n💡 Run this first:");
      console.log("   node create-hotel-agent.js\n");
      process.exit(1);
    }

    // Parse keys
    const travelKey = PrivateKey.fromStringECDSA(
      process.env.HEDERA_PRIVATE_KEY.replace(/^["']|["']$/g, "").replace(
        /^0x/i,
        ""
      )
    );

    const hotelKey = PrivateKey.fromStringECDSA(
      process.env.HOTEL_PRIVATE_KEY.replace(/^["']|["']$/g, "").replace(
        /^0x/i,
        ""
      )
    );

    const client = Client.forTestnet().setOperator(
      process.env.HEDERA_ACCOUNT_ID,
      travelKey
    );

    const topicId = process.env.A2A_TOPIC_ID;

    console.log("📋 Current Setup:");
    console.log(`   Topic ID: ${topicId}`);
    console.log(`   Travel Agent: ${process.env.HEDERA_ACCOUNT_ID}`);
    console.log(`   Hotel Agent: ${process.env.HOTEL_ACCOUNT_ID}\n`);

    // Create a key list with BOTH agent public keys
    const submitKeyList = new KeyList(
      [travelKey.publicKey, hotelKey.publicKey],
      1
    ); // Threshold of 1 (any key can submit)

    console.log("🔑 Creating submit key list with both agents...");

    // Update topic
    const updateTx = await new TopicUpdateTransaction()
      .setTopicId(topicId)
      .setSubmitKey(submitKeyList)
      .execute(client);

    const receipt = await updateTx.getReceipt(client);

    console.log("\n✅ Topic Updated Successfully!");
    console.log(`   Status: ${receipt.status.toString()}`);
    console.log(`   Transaction: ${updateTx.transactionId.toString()}`);

    console.log("\n✨ Both agents can now submit messages to the topic!");
    console.log("\n💡 Now run:");
    console.log("   node runAgents.js\n");
  } catch (error) {
    console.error("\n❌ Failed to update topic:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

updateTopic();
