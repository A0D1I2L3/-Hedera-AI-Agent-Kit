// demo-real.js - Real A2A demo with actual payment execution
const dotenv = require("dotenv");
dotenv.config();

const {
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction,
  TransferTransaction,
  Hbar,
} = require("@hashgraph/sdk");
const crypto = require("crypto");

// A2A Message Classes (same as before)
class A2AMessage {
  constructor(type, content, agentId, accountId) {
    this.id = crypto.randomUUID();
    this.timestamp = new Date().toISOString();
    this.protocol_version = "1.0";
    this.message_type = type;
    this.sender = {
      agent_id: agentId,
      account_id: accountId,
    };
    this.content = content;
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      protocol_version: this.protocol_version,
      message_type: this.message_type,
      sender: this.sender,
      content: this.content,
    };
  }
}

// Real Agent with actual payment capability
class RealAgent {
  constructor(name, agentId, client, topicId, accountId) {
    this.name = name;
    this.agentId = agentId;
    this.client = client;
    this.topicId = topicId;
    this.accountId = accountId;
    this.balance = 0;
  }

  async checkBalance() {
    try {
      const balance = await this.client.getAccountBalance(this.accountId);
      this.balance = balance.hbars.toBigNumber().toNumber();
      return this.balance;
    } catch (error) {
      console.error(`Error checking balance: ${error.message}`);
      return 0;
    }
  }

  async sendMessage(type, content) {
    const message = new A2AMessage(type, content, this.agentId, this.accountId);

    console.log(`\n📤 [${this.name}] Sending ${type} message`);
    console.log(`   ID: ${message.id}`);
    console.log(`   Content:`, JSON.stringify(content, null, 2));

    const messageString = JSON.stringify(message.toJSON());

    const submitTx = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(messageString)
      .execute(this.client);

    const receipt = await submitTx.getReceipt(this.client);
    console.log(`   ✅ Sent! Sequence: ${receipt.topicSequenceNumber}`);

    return message;
  }

  async executePayment(amount, recipient, memo) {
    try {
      console.log(`\n💳 [${this.name}] Executing REAL payment...`);
      console.log(`   From: ${this.accountId}`);
      console.log(`   To: ${recipient}`);
      console.log(`   Amount: ${amount} HBAR`);
      console.log(`   Memo: ${memo}`);

      // Check if we have enough balance
      await this.checkBalance();
      if (this.balance < amount) {
        throw new Error(
          `Insufficient balance. Have: ${this.balance} HBAR, Need: ${amount} HBAR`
        );
      }

      const transaction = await new TransferTransaction()
        .addHbarTransfer(this.accountId, Hbar.from(-amount))
        .addHbarTransfer(recipient, Hbar.from(amount))
        .setTransactionMemo(memo)
        .execute(this.client);

      const receipt = await transaction.getReceipt(this.client);

      console.log(`   ✅ Payment executed!`);
      console.log(`   Transaction ID: ${transaction.transactionId.toString()}`);
      console.log(`   Status: ${receipt.status.toString()}`);
      console.log(
        `   🔗 View: https://hashscan.io/testnet/transaction/${transaction.transactionId.toString()}`
      );

      // Update balance
      await this.checkBalance();
      console.log(`   New balance: ${this.balance} HBAR`);

      return transaction.transactionId.toString();
    } catch (error) {
      console.error(`   ❌ Payment failed: ${error.message}`);
      throw error;
    }
  }

  log(message) {
    console.log(`\n💭 [${this.name}]: ${message}`);
  }
}

// Demo with REAL payment execution
async function runRealDemo() {
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🎭 REAL A2A Protocol Demo with Actual Payments");
    console.log("=".repeat(60) + "\n");

    // Setup client
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

    const topicId = process.env.A2A_TOPIC_ID;
    if (!topicId) {
      console.error("❌ A2A_TOPIC_ID not set. Run create-topic.js first!");
      process.exit(1);
    }

    // Get or create second account for hotel agent
    const hotelAccountId =
      process.env.HOTEL_ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID;

    // Create agents
    const travelAgent = new RealAgent(
      "Travel Agent",
      "travel-agent-001",
      client,
      topicId,
      process.env.HEDERA_ACCOUNT_ID
    );

    const hotelAgent = new RealAgent(
      "Hotel Agent",
      "hotel-agent-001",
      client,
      topicId,
      hotelAccountId
    );

    console.log("🤖 Real Agents initialized:");
    console.log(`   • ${travelAgent.name} (${travelAgent.accountId})`);
    console.log(`   • ${hotelAgent.name} (${hotelAgent.accountId})`);
    console.log(`\n📡 Using topic: ${topicId}\n`);

    // Check initial balance
    await travelAgent.checkBalance();
    console.log(`💰 Travel Agent Balance: ${travelAgent.balance} HBAR\n`);

    // Adjust payment amount based on available balance
    const maxPayment = Math.min(5, Math.floor(travelAgent.balance * 0.1)); // Use max 10% of balance or 5 HBAR

    if (maxPayment < 1) {
      console.error("❌ Insufficient balance for demo. Need at least 10 HBAR.");
      console.log(
        "\n💡 Get testnet HBAR from: https://portal.hedera.com/faucet"
      );
      process.exit(1);
    }

    const initialPrice = maxPayment + 1;
    const negotiatedPrice = maxPayment;

    await sleep(1000);

    // ========== STEP 1: REQUEST ==========
    console.log("\n" + "─".repeat(60));
    console.log("STEP 1: Travel Agent sends booking request");
    console.log("─".repeat(60));

    travelAgent.log("I need to book a room for my client");
    await sleep(500);

    await travelAgent.sendMessage("request", {
      service: "hotel_booking",
      details: {
        destination: "Miami Beach",
        check_in: "2025-12-25",
        check_out: "2025-12-27",
        rooms: 1,
        guests: 2,
      },
      requires_response: true,
    });

    await sleep(2000);

    // ========== STEP 2: RESPONSE ==========
    console.log("\n" + "─".repeat(60));
    console.log("STEP 2: Hotel Agent responds with availability");
    console.log("─".repeat(60));

    hotelAgent.log("Let me check availability... Yes, I have a room!");
    await sleep(500);

    await hotelAgent.sendMessage("response", {
      status: "available",
      options: [
        {
          room_type: "Ocean View Suite",
          price_per_night: initialPrice,
          currency: "HBAR",
          total_nights: 2,
          total_price: initialPrice * 2,
        },
      ],
      booking_reference: "HOTEL-" + crypto.randomUUID().substring(0, 8),
    });

    await sleep(2000);

    // ========== STEP 3: NEGOTIATION ==========
    console.log("\n" + "─".repeat(60));
    console.log("STEP 3: Price negotiation");
    console.log("─".repeat(60));

    travelAgent.log(`Can you do ${negotiatedPrice} HBAR total?`);
    await sleep(500);

    await travelAgent.sendMessage("negotiation", {
      counter_offer: {
        total_price: negotiatedPrice,
        currency: "HBAR",
        reason: "Budget constraint",
      },
    });

    await sleep(2000);

    hotelAgent.log(`Alright, ${negotiatedPrice} HBAR it is!`);
    await sleep(500);

    await hotelAgent.sendMessage("negotiation", {
      final_offer: {
        total_price: negotiatedPrice,
        currency: "HBAR",
        terms: "Final offer - deal!",
      },
      status: "accepted",
    });

    await sleep(2000);

    // ========== STEP 4: REAL PAYMENT ==========
    console.log("\n" + "─".repeat(60));
    console.log("STEP 4: REAL Payment Settlement via AP2");
    console.log("─".repeat(60));

    travelAgent.log("Deal! Processing REAL payment now...");
    await sleep(500);

    const paymentMessage = await travelAgent.sendMessage("payment", {
      amount: negotiatedPrice.toString(),
      currency: "HBAR",
      recipient: hotelAccountId,
      description: "Hotel booking Miami Beach",
      payment_method: "hedera_transfer",
      booking_reference: "HOTEL-" + crypto.randomUUID().substring(0, 8),
    });

    await sleep(1000);

    // EXECUTE REAL PAYMENT
    const txId = await travelAgent.executePayment(
      negotiatedPrice,
      hotelAccountId,
      `A2A Payment: ${paymentMessage.id}`
    );

    await sleep(2000);

    // ========== STEP 5: CONFIRMATION ==========
    console.log("\n" + "─".repeat(60));
    console.log("STEP 5: Booking confirmation");
    console.log("─".repeat(60));

    hotelAgent.log("Payment received! Booking confirmed.");
    await sleep(500);

    await hotelAgent.sendMessage("response", {
      status: "confirmed",
      booking_details: {
        confirmation_number:
          "CONF-" + crypto.randomUUID().substring(0, 10).toUpperCase(),
        property: "Miami Beach Resort",
        check_in: "2025-12-25",
        check_out: "2025-12-27",
        rooms: 1,
        total_paid: `${negotiatedPrice} HBAR`,
        payment_transaction: txId,
      },
      payment_id: paymentMessage.id,
    });

    await sleep(1000);

    // ========== SUMMARY ==========
    console.log("\n" + "=".repeat(60));
    console.log("✅ REAL NEGOTIATION & PAYMENT COMPLETE");
    console.log("=".repeat(60));
    console.log("\n📊 Transaction Summary:");
    console.log(`   • Initial Price: ${initialPrice * 2} HBAR`);
    console.log(`   • Negotiated Price: ${negotiatedPrice} HBAR`);
    console.log(`   • Savings: ${initialPrice * 2 - negotiatedPrice} HBAR`);
    console.log(`   • Payment Status: ✅ EXECUTED ON HEDERA`);
    console.log(`   • Booking Status: ✅ CONFIRMED`);

    console.log(`\n🔗 View on HashScan:`);
    console.log(`   Messages: https://hashscan.io/testnet/topic/${topicId}`);
    console.log(`   Payment: https://hashscan.io/testnet/transaction/${txId}`);

    console.log(`\n✨ REAL A2A Protocol Features Demonstrated:`);
    console.log(`   ✅ Multi-agent communication via HCS`);
    console.log(`   ✅ Structured message exchange (A2A)`);
    console.log(`   ✅ Agent-to-agent negotiation`);
    console.log(`   ✅ REAL payment settlement (AP2)`);
    console.log(`   ✅ Actual HBAR transfer on Hedera`);
    console.log(`   ✅ Full audit trail on HashScan\n`);
  } catch (error) {
    console.error("\n❌ Demo failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the real demo
console.log("\n⏳ Starting REAL demo in 2 seconds...\n");
setTimeout(() => {
  runRealDemo().then(() => {
    console.log("🎉 Real demo completed successfully!\n");
    process.exit(0);
  });
}, 2000);
