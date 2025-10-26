// run-two-agents.js - User-driven agent negotiation
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
const readline = require("readline");

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to ask user questions
function askUser(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Pretty output helpers
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

function header(text) {
  console.log("\n" + colors.bright + colors.cyan + "╔" + "═".repeat(68) + "╗");
  console.log("║ " + text.padEnd(67) + "║");
  console.log("╚" + "═".repeat(68) + "╝" + colors.reset);
}

function section(text) {
  console.log("\n" + colors.yellow + "▸ " + text + colors.reset);
  console.log(colors.dim + "  " + "─".repeat(66) + colors.reset);
}

function info(label, value, indent = 2) {
  const spaces = " ".repeat(indent);
  console.log(
    spaces +
      colors.dim +
      label +
      ": " +
      colors.reset +
      colors.bright +
      value +
      colors.reset,
  );
}

function success(text, indent = 2) {
  const spaces = " ".repeat(indent);
  console.log(spaces + colors.green + "✓ " + text + colors.reset);
}

function alert(text, indent = 2) {
  const spaces = " ".repeat(indent);
  console.log(spaces + colors.yellow + "⚠ " + text + colors.reset);
}

function error(text, indent = 2) {
  const spaces = " ".repeat(indent);
  console.log(spaces + colors.red + "✗ " + text + colors.reset);
}

// Available hotels
const HOTELS = [
  {
    id: "miami-beach-resort",
    name: "Miami Beach Resort",
    location: "Miami Beach, FL",
    pricePerNight: 3,
    minPrice: 4,
  },
  {
    id: "sunset-paradise",
    name: "Sunset Paradise Hotel",
    location: "Key West, FL",
    pricePerNight: 4,
    minPrice: 6,
  },
  {
    id: "ocean-view-suites",
    name: "Ocean View Suites",
    location: "Fort Lauderdale, FL",
    pricePerNight: 2.5,
    minPrice: 3,
  },
];

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

    this.client = Client.forTestnet().setOperator(accountId, privateKey);
    this.receivedMessages = [];
    this.isListening = false;
  }

  async sendMessage(type, content) {
    const message = new A2AMessage(type, content, this.agentId, this.accountId);

    section(`${this.name} Sending Message`);
    info("Type", type);
    info("Message ID", message.id.substring(0, 8) + "...");
    info("From", this.accountId);

    const messageString = JSON.stringify(message.toJSON());

    const submitTx = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(messageString)
      .execute(this.client);

    const receipt = await submitTx.getReceipt(this.client);
    success(`Sent! Sequence: ${receipt.topicSequenceNumber}`);

    return message;
  }

  startListening() {
    if (this.isListening) return;

    const now = Math.floor(Date.now() / 1000);

    new TopicMessageQuery()
      .setTopicId(this.topicId)
      .setStartTime(now)
      .subscribe(this.client, null, (message) => {
        try {
          const messageString = Buffer.from(message.contents).toString();
          const a2aMessage = JSON.parse(messageString);

          if (a2aMessage.sender.account_id !== this.accountId) {
            this.receivedMessages.push(a2aMessage);
            this.handleMessage(a2aMessage);
          }
        } catch (error) {
          // Ignore parsing errors
        }
      });

    this.isListening = true;
  }

  async handleMessage(message) {
    // Override in subclasses
  }

  async sendPayment(amount, recipient, memo) {
    section(`${this.name} Processing Payment`);
    info("Amount", `${amount} HBAR`);
    info("To", recipient);

    const transaction = await new TransferTransaction()
      .addHbarTransfer(this.accountId, Hbar.from(-amount))
      .addHbarTransfer(recipient, Hbar.from(amount))
      .setTransactionMemo(memo)
      .execute(this.client);

    const receipt = await transaction.getReceipt(this.client);

    success("Payment sent!");
    info("Transaction", transaction.transactionId.toString());
    console.log(
      colors.dim +
        "  🔗 " +
        `https://hashscan.io/testnet/transaction/${transaction.transactionId.toString()}` +
        colors.reset,
    );

    return transaction.transactionId.toString();
  }
}

// Travel Agent - with user interaction
class TravelAgent extends Agent {
  constructor(accountId, privateKey, topicId, userOffer) {
    super("Travel Agent", "travel-agent-001", accountId, privateKey, topicId);
    this.userOffer = userOffer;
    this.pendingBooking = null;
  }

  async handleMessage(message) {
    if (
      message.message_type === "response" &&
      message.content.status === "available"
    ) {
      section("Hotel Agent Response Received");
      const option = message.content.options[0];

      info("Room Type", option.room_type);
      info("Price per Night", `${option.price_per_night} HBAR`);
      info("Total Nights", option.total_nights);
      info("Total Price", `${option.total_price} HBAR`, 2);
      info("Booking Ref", message.content.booking_reference);

      // Compare hotel price with user's offer
      if (option.total_price <= this.userOffer) {
        success(
          `Hotel price (${option.total_price} HBAR) is within your budget (${this.userOffer} HBAR)!`,
          2,
        );

        await this.sendMessage("acceptance", {
          accepted_price: option.total_price,
          currency: "HBAR",
          booking_reference: message.content.booking_reference,
        });
      } else {
        alert(
          `Hotel wants ${option.total_price} HBAR, but your offer is ${this.userOffer} HBAR`,
          2,
        );
        info("Action", "Sending your counter-offer...", 2);

        await this.sendMessage("negotiation", {
          counter_offer: {
            total_price: this.userOffer,
            currency: "HBAR",
          },
          original_price: option.total_price,
        });
      }
    }

    if (
      message.message_type === "negotiation" &&
      message.content.status === "accepted"
    ) {
      section("Negotiation Successful! 🎉");
      const price = message.content.final_offer.total_price;
      success(`Hotel accepted your offer of ${price} HBAR!`);

      alert("Proceeding with payment...", 2);

      await this.sendMessage("payment", {
        amount: price.toString(),
        currency: "HBAR",
        recipient: message.sender.account_id,
        description: "Hotel booking payment",
      });

      await this.sendPayment(
        price,
        message.sender.account_id,
        "A2A Hotel Booking",
      );
    }

    if (
      message.message_type === "negotiation" &&
      message.content.status === "rejected"
    ) {
      section("Negotiation Failed");
      error("Hotel rejected your offer.");
      info("Your Offer", `${message.content.rejected_price} HBAR`);
      info("Hotel Minimum", `${message.content.minimum_price} HBAR`);
      alert("Try again with a higher offer.");
    }

    if (
      message.message_type === "response" &&
      message.content.status === "confirmed"
    ) {
      section("Booking Confirmed! 🎉");
      success("Your hotel reservation is complete!");
      info(
        "Confirmation Number",
        message.content.booking_details.confirmation_number,
      );
      info("Total Paid", message.content.booking_details.total_paid);
    }
  }
}

// Hotel Agent
class HotelAgent extends Agent {
  constructor(accountId, privateKey, topicId, selectedHotel) {
    super("Hotel Agent", "hotel-agent-001", accountId, privateKey, topicId);
    this.hotel = selectedHotel;
  }

  async handleMessage(message) {
    if (message.message_type === "request") {
      section("Hotel Agent Processing Request");
      info("Hotel", this.hotel.name);
      info("Location", this.hotel.location);
      info("Check-in", message.content.details.check_in);
      info("Check-out", message.content.details.check_out);
      success("Checking availability...");

      // Calculate nights
      const checkIn = new Date(message.content.details.check_in);
      const checkOut = new Date(message.content.details.check_out);
      const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
      const totalPrice = this.hotel.pricePerNight * nights;

      setTimeout(async () => {
        await this.sendMessage("response", {
          status: "available",
          options: [
            {
              room_type: "Standard Room",
              price_per_night: this.hotel.pricePerNight,
              currency: "HBAR",
              total_nights: nights,
              total_price: totalPrice,
            },
          ],
          booking_reference: "HOTEL-" + crypto.randomUUID().substring(0, 8),
        });
      }, 2000);
    }

    if (
      message.message_type === "negotiation" &&
      message.content.counter_offer
    ) {
      section("Hotel Agent Evaluating Counter-Offer");
      const counterPrice = message.content.counter_offer.total_price;
      const originalPrice = message.content.original_price;

      info("Original Price", `${originalPrice} HBAR`);
      info("Counter Offer", `${counterPrice} HBAR`);
      info("Minimum Price", `${this.hotel.minPrice} HBAR`);

      setTimeout(async () => {
        if (counterPrice >= this.hotel.minPrice) {
          success(`Counter-offer accepted!`);

          await this.sendMessage("negotiation", {
            final_offer: {
              total_price: counterPrice,
              currency: "HBAR",
            },
            status: "accepted",
          });
        } else {
          error(`Counter-offer too low (minimum: ${this.hotel.minPrice} HBAR)`);

          await this.sendMessage("negotiation", {
            status: "rejected",
            rejected_price: counterPrice,
            minimum_price: this.hotel.minPrice,
          });
        }
      }, 2000);
    }

    if (message.message_type === "acceptance") {
      section("Hotel Agent Processing Acceptance");
      success("Price accepted without negotiation!");
      info("Accepted Price", `${message.content.accepted_price} HBAR`);
      alert("Waiting for payment...");
    }

    if (message.message_type === "payment") {
      section("Hotel Agent Confirming Payment");
      success("Payment received!");
      info("Amount", `${message.content.amount} HBAR`);
      alert("Generating confirmation...");

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

async function main() {
  try {
    header("🏨  HOTEL BOOKING AGENT SYSTEM");

    if (!process.env.HOTEL_ACCOUNT_ID || !process.env.HOTEL_PRIVATE_KEY) {
      error("Hotel agent not configured!", 0);
      console.log(
        "\n" + colors.bright + "💡 Setup Instructions:" + colors.reset,
      );
      console.log("  1. Run: node create-hotel-agent.js");
      console.log("  2. Add HOTEL_ACCOUNT_ID and HOTEL_PRIVATE_KEY to .env\n");
      rl.close();
      process.exit(1);
    }

    // Step 1: Ask user to select hotel
    section("Available Hotels");
    HOTELS.forEach((hotel, index) => {
      console.log(
        `  ${colors.bright}${index + 1}.${colors.reset} ${colors.cyan}${hotel.name}${colors.reset}`,
      );
      info("   Location", hotel.location, 3);
      info("   Price", `${hotel.pricePerNight} HBAR/night`, 3);
      console.log("");
    });

    const hotelChoice = await askUser(
      colors.bright + "Select hotel (1-3): " + colors.reset,
    );
    const hotelIndex = parseInt(hotelChoice) - 1;

    if (hotelIndex < 0 || hotelIndex >= HOTELS.length) {
      error("Invalid hotel selection!", 0);
      rl.close();
      process.exit(1);
    }

    const selectedHotel = HOTELS[hotelIndex];
    success(`Selected: ${selectedHotel.name}`, 0);

    // Step 2: Ask for dates
    console.log("");
    const checkIn = await askUser(
      colors.bright + "Check-in date (YYYY-MM-DD): " + colors.reset,
    );
    const checkOut = await askUser(
      colors.bright + "Check-out date (YYYY-MM-DD): " + colors.reset,
    );

    // Calculate nights and estimated cost
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil(
      (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24),
    );
    const estimatedCost = selectedHotel.pricePerNight * nights;

    if (nights <= 0) {
      error("Invalid date range!", 0);
      rl.close();
      process.exit(1);
    }

    section("Booking Summary");
    info("Hotel", selectedHotel.name);
    info("Check-in", checkIn);
    info("Check-out", checkOut);
    info("Nights", nights);
    info("Estimated Cost", `${estimatedCost} HBAR`);

    // Step 3: Ask for user's offer
    console.log(
      "\n" +
        colors.dim +
        "  💡 The hotel's minimum acceptable price is " +
        colors.bright +
        selectedHotel.minPrice +
        " HBAR" +
        colors.reset,
    );
    const userOffer = await askUser(
      "\n" + colors.bright + "Your offer (in HBAR): " + colors.reset,
    );

    const offerAmount = parseFloat(userOffer);
    if (isNaN(offerAmount) || offerAmount <= 0) {
      error("Invalid offer amount!", 0);
      rl.close();
      process.exit(1);
    }

    success(`Your offer: ${offerAmount} HBAR`, 0);

    // Initialize agents
    const topicId = process.env.A2A_TOPIC_ID;

    const travelKey = PrivateKey.fromStringECDSA(
      process.env.HEDERA_PRIVATE_KEY.replace(/^["']|["']$/g, "").replace(
        /^0x/i,
        "",
      ),
    );
    const hotelKey = PrivateKey.fromStringECDSA(
      process.env.HOTEL_PRIVATE_KEY.replace(/^["']|["']$/g, "").replace(
        /^0x/i,
        "",
      ),
    );

    const travelAgent = new TravelAgent(
      process.env.HEDERA_ACCOUNT_ID,
      travelKey,
      topicId,
      offerAmount,
    );

    const hotelAgent = new HotelAgent(
      process.env.HOTEL_ACCOUNT_ID,
      hotelKey,
      topicId,
      selectedHotel,
    );

    // Check balances
    section("Agent Balance Check");
    const travelBalance = await new AccountBalanceQuery()
      .setAccountId(travelAgent.accountId)
      .execute(travelAgent.client);
    const hotelBalance = await new AccountBalanceQuery()
      .setAccountId(hotelAgent.accountId)
      .execute(hotelAgent.client);

    info(
      "Travel Agent",
      `${travelAgent.accountId} - ${travelBalance.hbars} HBAR`,
    );
    info("Hotel Agent", `${hotelAgent.accountId} - ${hotelBalance.hbars} HBAR`);

    if (travelBalance.hbars.toBigNumber().toNumber() < offerAmount + 1) {
      error(`Travel agent needs at least ${offerAmount + 1} HBAR`, 0);
      console.log("💡 Get testnet HBAR: https://portal.hedera.com/faucet\n");
      rl.close();
      process.exit(1);
    }

    travelAgent.startListening();
    hotelAgent.startListening();

    success("Both agents are listening!", 0);
    info("Topic ID", topicId, 0);
    console.log(
      colors.dim +
        "🔗 " +
        `https://hashscan.io/testnet/topic/${topicId}` +
        colors.reset,
    );

    await sleep(3000);

    header("🤝  STARTING NEGOTIATION");

    await travelAgent.sendMessage("request", {
      service: "hotel_booking",
      details: {
        hotel_id: selectedHotel.id,
        hotel_name: selectedHotel.name,
        destination: selectedHotel.location,
        check_in: checkIn,
        check_out: checkOut,
        rooms: 1,
      },
    });

    console.log(
      "\n" +
        colors.dim +
        "  ⏳ Agents are negotiating autonomously...\n" +
        colors.reset,
    );

    await sleep(25000);

    header("✅  SESSION COMPLETE");
    console.log(colors.dim + "\n  View all messages on HashScan:");
    console.log(
      `  https://hashscan.io/testnet/topic/${topicId}\n` + colors.reset,
    );

    rl.close();
    process.exit(0);
  } catch (error) {
    error("\nError: " + error.message, 0);
    console.error(error.stack);
    rl.close();
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
