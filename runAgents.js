// run-three-agents.js - Travel booking with hotel and insurance
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

// Nerd Font icons
const icons = {
  travel: "", // airplane
  hotel: "", // building
  insurance: "", // shield
  money: "", // dollar sign
  check: "", // check
  cross: "", // cross
  warning: "", // warning
  info: "", // info
  clock: "", // clock
  user: "", // user
  calendar: "", // calendar
  location: "", // map marker
  negotiation: "", // handshake
  payment: "", // credit card
  document: "", // file
  network: "", // network
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
  console.log(spaces + colors.green + icons.check + " " + text + colors.reset);
}

function alert(text, indent = 2) {
  const spaces = " ".repeat(indent);
  console.log(
    spaces + colors.yellow + icons.warning + " " + text + colors.reset,
  );
}

function error(text, indent = 2) {
  const spaces = " ".repeat(indent);
  console.log(spaces + colors.red + icons.cross + " " + text + colors.reset);
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

// Insurance coverage tiers
const INSURANCE_TIERS = [
  {
    id: "basic",
    name: "Basic Coverage",
    coveragePercent: 0.1, // 10% of trip cost
    benefits: ["Trip cancellation", "24/7 support"],
  },
  {
    id: "standard",
    name: "Standard Coverage",
    coveragePercent: 0.15, // 15% of trip cost
    benefits: [
      "Trip cancellation",
      "Medical emergency",
      "Lost luggage",
      "24/7 support",
    ],
  },
  {
    id: "premium",
    name: "Premium Coverage",
    coveragePercent: 0.2, // 20% of trip cost
    benefits: [
      "All Standard benefits",
      "Flight delays",
      "Adventure sports",
      "Cancel for any reason",
    ],
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
        "  " +
        icons.network +
        " " +
        `https://hashscan.io/testnet/transaction/${transaction.transactionId.toString()}` +
        colors.reset,
    );

    return transaction.transactionId.toString();
  }
}

// Travel Agent - coordinates the booking
class TravelAgent extends Agent {
  constructor(accountId, privateKey, topicId, userOffer) {
    super("Travel Agent", "travel-agent-001", accountId, privateKey, topicId);
    this.userOffer = userOffer;
    this.hotelPrice = null;
    this.insuranceTier = null;
    this.bookingConfirmed = false;
  }

  async handleMessage(message) {
    // Handle hotel response
    if (
      message.message_type === "response" &&
      message.content.status === "available"
    ) {
      section(`${icons.hotel} Hotel Response Received`);
      const option = message.content.options[0];

      info("Room Type", option.room_type);
      info("Price per Night", `${option.price_per_night} HBAR`);
      info("Total Nights", option.total_nights);
      info("Total Price", `${option.total_price} HBAR`, 2);

      this.hotelPrice = option.total_price;

      if (option.total_price <= this.userOffer) {
        success(`Price within budget!`, 2);
        await this.sendMessage("acceptance", {
          accepted_price: option.total_price,
          currency: "HBAR",
          booking_reference: message.content.booking_reference,
        });
      } else {
        alert(`Negotiating price...`, 2);
        await this.sendMessage("negotiation", {
          counter_offer: {
            total_price: this.userOffer,
            currency: "HBAR",
          },
          original_price: option.total_price,
        });
      }
    }

    // Handle hotel negotiation result
    if (
      message.message_type === "negotiation" &&
      message.content.status === "accepted"
    ) {
      section(`${icons.negotiation} Hotel Negotiation Successful`);
      const price = message.content.final_offer.total_price;
      this.hotelPrice = price;
      success(`Hotel accepted ${price} HBAR!`);

      await this.sendMessage("acceptance", {
        accepted_price: price,
        currency: "HBAR",
      });
    }

    if (
      message.message_type === "negotiation" &&
      message.content.status === "rejected"
    ) {
      section(`${icons.cross} Hotel Negotiation Failed`);
      error("Hotel rejected your offer.");
      info("Your Offer", `${message.content.rejected_price} HBAR`);
      info("Hotel Minimum", `${message.content.minimum_price} HBAR`);
    }

    // Handle hotel confirmation
    if (
      message.message_type === "response" &&
      message.content.status === "confirmed"
    ) {
      section(`${icons.check} Hotel Booking Confirmed`);
      success("Hotel reservation complete!");
      info("Confirmation", message.content.booking_details.confirmation_number);
      info("Paid", message.content.booking_details.total_paid);
      this.bookingConfirmed = true;
    }

    // Handle insurance offer
    if (message.message_type === "insurance_offer") {
      section(`${icons.insurance} Insurance Offer Received`);
      const offers = message.content.coverage_options;

      console.log("\n  Available Insurance Plans:\n");
      offers.forEach((offer, index) => {
        console.log(
          `  ${colors.bright}${index + 1}. ${offer.tier_name}${colors.reset} - ${colors.green}${offer.premium} HBAR${colors.reset}`,
        );
        offer.benefits.forEach((benefit) => {
          console.log(
            colors.dim + `     ${icons.check} ${benefit}` + colors.reset,
          );
        });
        console.log("");
      });

      const choice = await askUser(
        colors.bright +
          "  Select insurance (1-3) or 0 to skip: " +
          colors.reset,
      );
      const tierIndex = parseInt(choice) - 1;

      if (tierIndex >= 0 && tierIndex < offers.length) {
        const selectedTier = offers[tierIndex];
        this.insuranceTier = selectedTier;

        success(`Selected: ${selectedTier.tier_name}`, 2);

        await this.sendMessage("insurance_purchase", {
          tier_id: selectedTier.tier_id,
          premium: selectedTier.premium,
          currency: "HBAR",
          policy_holder: this.accountId,
        });

        // Send insurance payment
        await this.sendPayment(
          selectedTier.premium,
          message.sender.account_id,
          "A2A Travel Insurance",
        );
      } else {
        alert("Insurance skipped", 2);
        await this.sendMessage("insurance_declined", {
          reason: "User declined coverage",
        });
      }
    }

    // Handle insurance confirmation
    if (message.message_type === "insurance_confirmed") {
      section(`${icons.insurance} Insurance Policy Issued`);
      success("Travel insurance activated!");
      info("Policy Number", message.content.policy_details.policy_number);
      info("Coverage", message.content.policy_details.coverage);
      info("Valid Until", message.content.policy_details.valid_until);
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
      section(`${icons.hotel} Hotel Processing Request`);
      info("Hotel", this.hotel.name);
      info("Location", this.hotel.location);
      info("Check-in", message.content.details.check_in);
      info("Check-out", message.content.details.check_out);

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
      section(`${icons.negotiation} Hotel Evaluating Counter-Offer`);
      const counterPrice = message.content.counter_offer.total_price;

      info("Counter Offer", `${counterPrice} HBAR`);
      info("Minimum Price", `${this.hotel.minPrice} HBAR`);

      setTimeout(async () => {
        if (counterPrice >= this.hotel.minPrice) {
          success(`Counter-offer accepted!`);
          await this.sendMessage("negotiation", {
            final_offer: { total_price: counterPrice, currency: "HBAR" },
            status: "accepted",
          });
        } else {
          error(`Counter-offer too low`);
          await this.sendMessage("negotiation", {
            status: "rejected",
            rejected_price: counterPrice,
            minimum_price: this.hotel.minPrice,
          });
        }
      }, 2000);
    }

    if (message.message_type === "acceptance") {
      section(`${icons.hotel} Hotel Processing Acceptance`);
      success("Price accepted!");
      alert("Waiting for payment...");
    }

    if (message.message_type === "payment") {
      section(`${icons.payment} Hotel Confirming Payment`);
      success("Payment received!");
      info("Amount", `${message.content.amount} HBAR`);

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

// Insurance Agent
class InsuranceAgent extends Agent {
  constructor(accountId, privateKey, topicId, tripCost) {
    super(
      "Insurance Agent",
      "insurance-agent-001",
      accountId,
      privateKey,
      topicId,
    );
    this.tripCost = tripCost;
  }

  async handleMessage(message) {
    // Listen for hotel acceptance to trigger insurance offer
    if (
      message.message_type === "acceptance" &&
      message.sender.agent_id === "travel-agent-001"
    ) {
      section(`${icons.insurance} Insurance Agent Analyzing Trip`);
      info("Trip Cost", `${message.content.accepted_price} HBAR`);
      success("Calculating insurance premiums...");

      const tripCost = message.content.accepted_price;

      setTimeout(async () => {
        const offers = INSURANCE_TIERS.map((tier) => ({
          tier_id: tier.id,
          tier_name: tier.name,
          premium: parseFloat((tripCost * tier.coveragePercent).toFixed(2)),
          coverage_amount: tripCost,
          currency: "HBAR",
          benefits: tier.benefits,
        }));

        await this.sendMessage("insurance_offer", {
          trip_reference: message.content.booking_reference || "N/A",
          trip_cost: tripCost,
          coverage_options: offers,
          valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
        });
      }, 3000);
    }

    if (message.message_type === "insurance_purchase") {
      section(`${icons.insurance} Insurance Agent Processing Purchase`);
      info("Tier", message.content.tier_id);
      info("Premium", `${message.content.premium} HBAR`);
      success("Payment received!");
      alert("Issuing policy...");

      setTimeout(async () => {
        const tier = INSURANCE_TIERS.find(
          (t) => t.id === message.content.tier_id,
        );
        await this.sendMessage("insurance_confirmed", {
          policy_details: {
            policy_number:
              "INS-" + crypto.randomUUID().substring(0, 12).toUpperCase(),
            tier: tier.name,
            coverage: `${message.content.premium / tier.coveragePercent} HBAR`,
            premium_paid: `${message.content.premium} HBAR`,
            benefits: tier.benefits,
            valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0],
          },
        });
      }, 2000);
    }

    if (message.message_type === "insurance_declined") {
      section(`${icons.insurance} Insurance Agent`);
      alert("Customer declined coverage");
    }
  }
}

async function main() {
  try {
    header(`${icons.travel}  TRAVEL BOOKING SYSTEM WITH INSURANCE`);

    // Check all agents configured
    if (!process.env.HOTEL_ACCOUNT_ID || !process.env.HOTEL_PRIVATE_KEY) {
      error("Hotel agent not configured!", 0);
      console.log(
        "\n" +
          colors.dim +
          icons.info +
          " Run: node create-hotel-agent.js\n" +
          colors.reset,
      );
      rl.close();
      process.exit(1);
    }

    if (
      !process.env.INSURANCE_ACCOUNT_ID ||
      !process.env.INSURANCE_PRIVATE_KEY
    ) {
      error("Insurance agent not configured!", 0);
      console.log(
        "\n" +
          colors.dim +
          icons.info +
          " Run: node create-insurance-agent.js\n" +
          colors.reset,
      );
      rl.close();
      process.exit(1);
    }

    // Step 1: Select hotel
    section(`${icons.hotel} Available Hotels`);
    HOTELS.forEach((hotel, index) => {
      console.log(
        `  ${colors.bright}${index + 1}.${colors.reset} ${colors.cyan}${hotel.name}${colors.reset}`,
      );
      info(`   ${icons.location} Location`, hotel.location, 3);
      info(`   ${icons.money} Price`, `${hotel.pricePerNight} HBAR/night`, 3);
      console.log("");
    });

    const hotelChoice = await askUser(
      colors.bright + "Select hotel (1-3): " + colors.reset,
    );
    const hotelIndex = parseInt(hotelChoice) - 1;

    if (hotelIndex < 0 || hotelIndex >= HOTELS.length) {
      error("Invalid selection!", 0);
      rl.close();
      process.exit(1);
    }

    const selectedHotel = HOTELS[hotelIndex];
    success(`Selected: ${selectedHotel.name}`, 0);

    // Step 2: Dates with validation
    console.log("");

    let checkIn, checkOut, checkInDate, checkOutDate, nights;
    let validDates = false;

    while (!validDates) {
      checkIn = await askUser(
        colors.bright +
          `${icons.calendar} Check-in date (YYYY-MM-DD): ` +
          colors.reset,
      );
      checkOut = await askUser(
        colors.bright +
          `${icons.calendar} Check-out date (YYYY-MM-DD): ` +
          colors.reset,
      );

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(checkIn) || !dateRegex.test(checkOut)) {
        error("Invalid date format! Use YYYY-MM-DD", 0);
        continue;
      }

      checkInDate = new Date(checkIn);
      checkOutDate = new Date(checkOut);

      // Check if dates are valid calendar dates
      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
        error("Invalid date! Please check the day/month values", 0);
        continue;
      }

      // Verify the parsed date matches input (catches invalid dates like 2025-10-32)
      const checkInParts = checkIn.split("-");
      const checkOutParts = checkOut.split("-");

      if (
        checkInDate.getFullYear() !== parseInt(checkInParts[0]) ||
        checkInDate.getMonth() !== parseInt(checkInParts[1]) - 1 ||
        checkInDate.getDate() !== parseInt(checkInParts[2])
      ) {
        error(
          `Invalid check-in date! ${checkInParts[1]}-${checkInParts[2]} doesn't exist`,
          0,
        );
        continue;
      }

      if (
        checkOutDate.getFullYear() !== parseInt(checkOutParts[0]) ||
        checkOutDate.getMonth() !== parseInt(checkOutParts[1]) - 1 ||
        checkOutDate.getDate() !== parseInt(checkOutParts[2])
      ) {
        error(
          `Invalid check-out date! ${checkOutParts[1]}-${checkOutParts[2]} doesn't exist`,
          0,
        );
        continue;
      }

      // Check if check-in is not in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (checkInDate < today) {
        error("Check-in date cannot be in the past!", 0);
        continue;
      }

      // Calculate nights
      nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

      if (nights <= 0) {
        error("Check-out must be after check-in date!", 0);
        continue;
      }

      if (nights > 365) {
        error("Maximum stay is 365 nights!", 0);
        continue;
      }

      validDates = true;
    }

    const estimatedCost = selectedHotel.pricePerNight * nights;

    section(`${icons.document} Booking Summary`);
    info("Hotel", selectedHotel.name);
    info("Nights", nights);
    info("Estimated Cost", `${estimatedCost} HBAR`);

    // Step 3: Offer
    console.log(
      "\n" +
        colors.dim +
        "  " +
        icons.info +
        " Hotel minimum: " +
        colors.bright +
        selectedHotel.minPrice +
        " HBAR" +
        colors.reset,
    );
    const userOffer = await askUser(
      "\n" +
        colors.bright +
        `${icons.money} Your offer (in HBAR): ` +
        colors.reset,
    );

    const offerAmount = parseFloat(userOffer);
    if (isNaN(offerAmount) || offerAmount <= 0) {
      error("Invalid offer!", 0);
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
    const insuranceKey = PrivateKey.fromStringECDSA(
      process.env.INSURANCE_PRIVATE_KEY.replace(/^["']|["']$/g, "").replace(
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

    const insuranceAgent = new InsuranceAgent(
      process.env.INSURANCE_ACCOUNT_ID,
      insuranceKey,
      topicId,
      estimatedCost,
    );

    // Check balances
    section(`${icons.money} Agent Balances`);
    const travelBalance = await new AccountBalanceQuery()
      .setAccountId(travelAgent.accountId)
      .execute(travelAgent.client);
    const hotelBalance = await new AccountBalanceQuery()
      .setAccountId(hotelAgent.accountId)
      .execute(hotelAgent.client);
    const insuranceBalance = await new AccountBalanceQuery()
      .setAccountId(insuranceAgent.accountId)
      .execute(insuranceAgent.client);

    info(
      `${icons.travel} Travel Agent`,
      `${travelAgent.accountId} - ${travelBalance.hbars} HBAR`,
    );
    info(
      `${icons.hotel} Hotel Agent`,
      `${hotelAgent.accountId} - ${hotelBalance.hbars} HBAR`,
    );
    info(
      `${icons.insurance} Insurance Agent`,
      `${insuranceAgent.accountId} - ${insuranceBalance.hbars} HBAR`,
    );

    // Start listening
    travelAgent.startListening();
    hotelAgent.startListening();
    insuranceAgent.startListening();

    success("All agents are listening!", 0);
    info(`${icons.network} Topic ID`, topicId, 0);
    console.log(
      colors.dim +
        "  " +
        icons.network +
        " " +
        `https://hashscan.io/testnet/topic/${topicId}` +
        colors.reset,
    );

    await sleep(3000);

    header(`${icons.negotiation}  STARTING NEGOTIATION`);

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
        "  " +
        icons.clock +
        " Agents are negotiating autonomously...\n" +
        colors.reset,
    );

    await sleep(30000);

    header(`${icons.check}  SESSION COMPLETE`);
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
