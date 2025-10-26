// run-two-agents.js - Run both agents and let them negotiate
const dotenv = require("dotenv");
dotenv.config();

const {
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  TransferTransaction,
  Hbar,
  AccountBalanceQuery,
} = require("@hashgraph/sdk");
const crypto = require("crypto");

// A2A Message Class
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

// Agent that can send/receive messages and payments
class Agent {
  constructor(name, agentId, accountId, privateKey, topicId) {
    this.name = name;
    this.agentId = agentId;
    this.accountId = accountId;
    this.topicId = topicId;

    // Create separate client for this agent
    this.client = Client.forTestnet().setOperator(accountId, privateKey);
    this.receivedMessages = [];
    this.isListening = false;
  }

  // Send A2A message
  async sendMessage(type, content) {
    const message = new A2AMessage(type, content, this.agentId, this.accountId);

    console.log(`\n📤 [${this.name}] Sending ${type}`);
    console.log(`   From: ${this.accountId}`);
    console.log(`   Message ID: ${message.id}`);

    const messageString = JSON.stringify(message.toJSON());

    const submitTx = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(messageString)
      .execute(this.client);

    const receipt = await submitTx.getReceipt(this.client);
    console.log(`   ✅ Sent! Sequence: ${receipt.topicSequenceNumber}`);

    return message;
  }

  // Listen for messages on the topic
  startListening() {
    if (this.isListening) return;

    console.log(
      `\n👂 [${this.name}] Started listening to topic ${this.topicId}`
    );

    // Start listening from NOW (not from beginning)
    const now = Math.floor(Date.now() / 1000);

    new TopicMessageQuery()
      .setTopicId(this.topicId)
      .setStartTime(now) // Only get NEW messages
      .subscribe(this.client, null, (message) => {
        try {
          const messageString = Buffer.from(message.contents).toString();
          const a2aMessage = JSON.parse(messageString);

          // Only process messages from OTHER agents
          if (a2aMessage.sender.account_id !== this.accountId) {
            console.log(
              `\n📥 [${this.name}] Received ${a2aMessage.message_type}`
            );
            console.log(
              `   From: ${a2aMessage.sender.agent_id} (${a2aMessage.sender.account_id})`
            );
            console.log(`   Message ID: ${a2aMessage.id}`);

            this.receivedMessages.push(a2aMessage);
            this.handleMessage(a2aMessage);
          }
        } catch (error) {
          // Ignore parsing errors (might be old/invalid messages)
        }
      });

    this.isListening = true;
  }

  // Handle incoming messages
  async handleMessage(message) {
    // Override this in subclasses
    console.log(`   💭 Processing...`);
  }

  // Execute payment
  async sendPayment(amount, recipient, memo) {
    console.log(`\n💰 [${this.name}] Sending payment`);
    console.log(`   Amount: ${amount} HBAR`);
    console.log(`   To: ${recipient}`);

    const transaction = await new TransferTransaction()
      .addHbarTransfer(this.accountId, Hbar.from(-amount))
      .addHbarTransfer(recipient, Hbar.from(amount))
      .setTransactionMemo(memo)
      .execute(this.client);

    const receipt = await transaction.getReceipt(this.client);

    console.log(`   ✅ Payment sent!`);
    console.log(`   Transaction: ${transaction.transactionId.toString()}`);
    console.log(
      `   🔗 https://hashscan.io/testnet/transaction/${transaction.transactionId.toString()}`
    );

    return transaction.transactionId.toString();
  }
}

// Travel Agent - initiates bookings
class TravelAgent extends Agent {
  constructor(accountId, privateKey, topicId) {
    super("Travel Agent", "travel-agent-001", accountId, privateKey, topicId);
    this.pendingBooking = null;
  }

  async handleMessage(message) {
    if (message.message_type === "response") {
      console.log(
        `   💭 Got offer: ${message.content.options[0].total_price} HBAR`
      );

      // Auto-negotiate if price is too high
      const offeredPrice = message.content.options[0].total_price;
      if (offeredPrice > 5) {
        console.log(`   💭 Price too high, negotiating...`);
        await this.sendMessage("negotiation", {
          counter_offer: {
            total_price: Math.floor(offeredPrice * 0.8),
            currency: "HBAR",
          },
        });
      } else {
        console.log(`   💭 Price acceptable, will pay...`);
        this.pendingBooking = message.content;
      }
    }

    if (
      message.message_type === "negotiation" &&
      message.content.status === "accepted"
    ) {
      console.log(`   💭 Deal accepted! Sending payment...`);
      const price = message.content.final_offer.total_price;

      // Send payment message
      await this.sendMessage("payment", {
        amount: price.toString(),
        currency: "HBAR",
        recipient: message.sender.account_id,
        description: "Hotel booking payment",
      });

      // Execute actual payment
      await this.sendPayment(
        price,
        message.sender.account_id,
        "A2A Hotel Booking"
      );
    }
  }
}

// Hotel Agent - responds to bookings
class HotelAgent extends Agent {
  constructor(accountId, privateKey, topicId) {
    super("Hotel Agent", "hotel-agent-001", accountId, privateKey, topicId);
  }

  async handleMessage(message) {
    if (message.message_type === "request") {
      console.log(`   💭 Booking request received, checking availability...`);

      // Respond with offer
      setTimeout(async () => {
        await this.sendMessage("response", {
          status: "available",
          options: [
            {
              room_type: "Ocean View Suite",
              price_per_night: 3,
              currency: "HBAR",
              total_nights: 2,
              total_price: 6,
            },
          ],
          booking_reference: "HOTEL-" + crypto.randomUUID().substring(0, 8),
        });
      }, 2000);
    }

    if (message.message_type === "negotiation") {
      // Check if counter_offer exists
      if (message.content.counter_offer) {
        console.log(
          `   💭 Counter offer: ${message.content.counter_offer.total_price} HBAR`
        );
        console.log(`   💭 Accepting...`);

        setTimeout(async () => {
          await this.sendMessage("negotiation", {
            final_offer: {
              total_price: message.content.counter_offer.total_price,
              currency: "HBAR",
            },
            status: "accepted",
          });
        }, 2000);
      }
    }

    if (message.message_type === "payment") {
      console.log(`   💭 Payment received! Confirming booking...`);

      setTimeout(async () => {
        await this.sendMessage("response", {
          status: "confirmed",
          booking_details: {
            confirmation_number: "CONF-" + crypto.randomUUID().substring(0, 8),
            total_paid: message.content.amount + " HBAR",
          },
        });
      }, 2000);
    }
  }
}

// Main execution
async function main() {
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🤖 Starting Two-Agent A2A System");
    console.log("=".repeat(60) + "\n");

    // Check if hotel agent is configured
    if (!process.env.HOTEL_ACCOUNT_ID || !process.env.HOTEL_PRIVATE_KEY) {
      console.error("❌ Hotel agent not configured!");
      console.log("\n💡 Run this first:");
      console.log("   node create-hotel-agent.js");
      console.log(
        "\nThen add HOTEL_ACCOUNT_ID and HOTEL_PRIVATE_KEY to .env\n"
      );
      process.exit(1);
    }

    const topicId = process.env.A2A_TOPIC_ID;

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

    // Create agents
    const travelAgent = new TravelAgent(
      process.env.HEDERA_ACCOUNT_ID,
      travelKey,
      topicId
    );

    const hotelAgent = new HotelAgent(
      process.env.HOTEL_ACCOUNT_ID,
      hotelKey,
      topicId
    );

    // Check balances

    const travelAgentQuery = new AccountBalanceQuery().setAccountId(
      travelAgent.accountId
    );
    const hotelAgentQuery = new AccountBalanceQuery().setAccountId(
      hotelAgent.accountId
    );
    const travelBalance = await travelAgentQuery.execute(travelAgent.client);
    const hotelBalance = await hotelAgentQuery.execute(hotelAgent.client);

    console.log("💰 Agent Balances:");
    console.log(
      `   Travel Agent (${travelAgent.accountId}): ${travelBalance} HBAR`
    );
    console.log(
      `   Hotel Agent (${hotelAgent.accountId}): ${hotelBalance} HBAR\n`
    );

    if (travelBalance < 5) {
      console.error("❌ Travel agent needs at least 5 HBAR");
      console.log("💡 Get testnet HBAR: https://portal.hedera.com/faucet\n");
      process.exit(1);
    }

    // Start listening
    travelAgent.startListening();
    hotelAgent.startListening();

    console.log("\n✅ Both agents are now live and listening!\n");
    console.log("📡 Topic: " + topicId);
    console.log("🔗 View: https://hashscan.io/testnet/topic/" + topicId);

    // Wait a moment for subscriptions to be ready
    await sleep(3000);

    // Travel agent initiates booking
    console.log("\n" + "─".repeat(60));
    console.log("🎬 Starting Booking Request...");
    console.log("─".repeat(60));

    await travelAgent.sendMessage("request", {
      service: "hotel_booking",
      details: {
        destination: "Miami Beach",
        check_in: "2025-12-25",
        check_out: "2025-12-27",
        rooms: 1,
      },
    });

    console.log("\n💬 Agents are now negotiating autonomously...");
    console.log("   (This will take ~10-15 seconds)\n");

    // Let agents communicate for a while
    await sleep(20000);

    console.log("\n" + "=".repeat(60));
    console.log("✅ Demo Complete!");
    console.log("=".repeat(60));
    console.log("\n🔗 Check the topic on HashScan to see all messages:");
    console.log(`   https://hashscan.io/testnet/topic/${topicId}\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
