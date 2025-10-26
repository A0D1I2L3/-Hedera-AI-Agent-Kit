const dotenv = require("dotenv");
dotenv.config();

const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { AgentExecutor, createToolCallingAgent } = require("langchain/agents");
const {
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
  TransferTransaction,
  Hbar,
} = require("@hashgraph/sdk");
const {
  HederaLangchainToolkit,
  coreAccountPlugin,
  coreAccountQueryPlugin,
  coreConsensusPlugin,
  coreConsensusQueryPlugin,
  coreTokenPlugin,
  coreTokenQueryPlugin,
  AgentMode,
} = require("hedera-agent-kit");
const readline = require("readline");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const crypto = require("crypto");
const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");

// A2A Message Class
class A2AMessage {
  constructor(type, content, agentId, accountId) {
    this.id = crypto.randomUUID();
    this.timestamp = new Date().toISOString();
    this.protocol_version = "1.0";
    this.message_type = type;
    this.sender = { agent_id: agentId, account_id: accountId };
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

// Specialized Agent Classes
class HotelAgent {
  constructor(accountId, privateKey, topicId, client) {
    this.name = "Hotel Agent";
    this.agentId = "hotel-agent-001";
    this.accountId = accountId;
    this.topicId = topicId;
    this.client = client;
    this.isListening = false;
  }

  startListening() {
    if (this.isListening) return;
    console.log(`\n🏨 Hotel Agent started listening...`);

    const now = Math.floor(Date.now() / 1000);
    new TopicMessageQuery()
      .setTopicId(this.topicId)
      .setStartTime(now)
      .subscribe(this.client, null, (message) => {
        try {
          const messageString = Buffer.from(message.contents).toString();
          const a2aMessage = JSON.parse(messageString);
          if (a2aMessage.sender.account_id !== this.accountId) {
            this.handleMessage(a2aMessage);
          }
        } catch (error) {}
      });
    this.isListening = true;
  }

  async handleMessage(message) {
    if (
      message.message_type === "request" &&
      message.content.service === "hotel_booking"
    ) {
      console.log(`\n📥 Hotel Agent: Received booking request`);
      const details = message.content.details;

      setTimeout(async () => {
        const pricePerNight = 3;
        const nights = 2;
        const totalPrice = pricePerNight * nights;

        await this.sendMessage("response", {
          status: "available",
          options: [
            {
              room_type: "Standard Room",
              price_per_night: pricePerNight,
              total_nights: nights,
              total_price: totalPrice,
              currency: "HBAR",
            },
          ],
          booking_reference: "HOTEL-" + crypto.randomUUID().substring(0, 8),
        });
        console.log(`✅ Hotel Agent: Sent offer - ${totalPrice} HBAR`);
      }, 2000);
    }

    if (
      message.message_type === "negotiation" &&
      message.content.counter_offer
    ) {
      const counterPrice = message.content.counter_offer.total_price;
      console.log(
        `\n📥 Hotel Agent: Counter offer received - ${counterPrice} HBAR`
      );

      setTimeout(async () => {
        const minPrice = 4;
        if (counterPrice >= minPrice) {
          await this.sendMessage("negotiation", {
            final_offer: { total_price: counterPrice, currency: "HBAR" },
            status: "accepted",
          });
          console.log(`✅ Hotel Agent: Accepted ${counterPrice} HBAR`);
        } else {
          await this.sendMessage("negotiation", {
            status: "rejected",
            minimum_price: minPrice,
          });
          console.log(`❌ Hotel Agent: Rejected - minimum is ${minPrice} HBAR`);
        }
      }, 2000);
    }

    if (message.message_type === "payment") {
      console.log(
        `\n💰 Hotel Agent: Payment received - ${message.content.amount} HBAR`
      );
      setTimeout(async () => {
        await this.sendMessage("response", {
          status: "confirmed",
          booking_details: {
            confirmation_number: "CONF-" + crypto.randomUUID().substring(0, 8),
            total_paid: message.content.amount + " HBAR",
          },
        });
        console.log(`✅ Hotel Agent: Booking confirmed!`);
      }, 2000);
    }
  }

  async sendMessage(type, content) {
    const message = new A2AMessage(type, content, this.agentId, this.accountId);
    const messageString = JSON.stringify(message.toJSON());

    const submitTx = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(messageString)
      .execute(this.client);

    await submitTx.getReceipt(this.client);
    return message;
  }
}

class InsuranceAgent {
  constructor(accountId, privateKey, topicId, client) {
    this.name = "Insurance Agent";
    this.agentId = "insurance-agent-001";
    this.accountId = accountId;
    this.topicId = topicId;
    this.client = client;
    this.isListening = false;
  }

  startListening() {
    if (this.isListening) return;
    console.log(`\n🛡️  Insurance Agent started listening...`);

    const now = Math.floor(Date.now() / 1000);
    new TopicMessageQuery()
      .setTopicId(this.topicId)
      .setStartTime(now)
      .subscribe(this.client, null, (message) => {
        try {
          const messageString = Buffer.from(message.contents).toString();
          const a2aMessage = JSON.parse(messageString);
          if (a2aMessage.sender.account_id !== this.accountId) {
            this.handleMessage(a2aMessage);
          }
        } catch (error) {}
      });
    this.isListening = true;
  }

  async handleMessage(message) {
    if (
      message.message_type === "request" &&
      message.content.service === "travel_insurance"
    ) {
      console.log(`\n📥 Insurance Agent: Received insurance request`);

      setTimeout(async () => {
        const tripCost = message.content.trip_cost || 10;
        const premium = parseFloat((tripCost * 0.15).toFixed(2));

        await this.sendMessage("response", {
          status: "available",
          coverage_options: [
            {
              tier: "Standard Coverage",
              premium: premium,
              coverage_amount: tripCost,
              currency: "HBAR",
              benefits: [
                "Trip cancellation",
                "Medical emergency",
                "Lost luggage",
              ],
            },
          ],
          policy_reference: "INS-" + crypto.randomUUID().substring(0, 8),
        });
        console.log(`✅ Insurance Agent: Sent quote - ${premium} HBAR premium`);
      }, 2000);
    }

    if (message.message_type === "payment") {
      console.log(
        `\n💰 Insurance Agent: Payment received - ${message.content.amount} HBAR`
      );
      setTimeout(async () => {
        await this.sendMessage("response", {
          status: "confirmed",
          policy_details: {
            policy_number:
              "POL-" + crypto.randomUUID().substring(0, 10).toUpperCase(),
            coverage: message.content.description,
            premium_paid: message.content.amount + " HBAR",
          },
        });
        console.log(`✅ Insurance Agent: Policy issued!`);
      }, 2000);
    }
  }

  async sendMessage(type, content) {
    const message = new A2AMessage(type, content, this.agentId, this.accountId);
    const messageString = JSON.stringify(message.toJSON());

    const submitTx = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(messageString)
      .execute(this.client);

    await submitTx.getReceipt(this.client);
    return message;
  }
}

// AI Provider
function createLLM() {
  if (process.env.GROQ_API_KEY) {
    const { ChatGroq } = require("@langchain/groq");
    return new ChatGroq({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.7,
    });
  }
  const { ChatOllama } = require("@langchain/ollama");
  return new ChatOllama({
    model: "llama3.2",
    baseUrl: "http://localhost:11434",
  });
}

async function main() {
  try {
    console.log("\n🤖 Initializing Smart AI Agent System...\n");

    const llm = createLLM();

    // Setup Hedera client
    let privateKeyString = process.env.HEDERA_PRIVATE_KEY.trim();
    privateKeyString = privateKeyString
      .replace(/^["']|["']$/g, "")
      .replace(/^0x/i, "");
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

    // Initialize specialized agents (dormant until needed)
    let hotelAgent = null;
    let insuranceAgent = null;

    if (process.env.HOTEL_ACCOUNT_ID && process.env.HOTEL_PRIVATE_KEY) {
      const hotelKey = PrivateKey.fromStringECDSA(
        process.env.HOTEL_PRIVATE_KEY.replace(/^["']|["']$/g, "").replace(
          /^0x/i,
          ""
        )
      );
      const hotelClient = Client.forTestnet().setOperator(
        process.env.HOTEL_ACCOUNT_ID,
        hotelKey
      );
      hotelAgent = new HotelAgent(
        process.env.HOTEL_ACCOUNT_ID,
        hotelKey,
        topicId,
        hotelClient
      );
    }

    if (process.env.INSURANCE_ACCOUNT_ID && process.env.INSURANCE_PRIVATE_KEY) {
      const insuranceKey = PrivateKey.fromStringECDSA(
        process.env.INSURANCE_PRIVATE_KEY.replace(/^["']|["']$/g, "").replace(
          /^0x/i,
          ""
        )
      );
      const insuranceClient = Client.forTestnet().setOperator(
        process.env.INSURANCE_ACCOUNT_ID,
        insuranceKey
      );
      insuranceAgent = new InsuranceAgent(
        process.env.INSURANCE_ACCOUNT_ID,
        insuranceKey,
        topicId,
        insuranceClient
      );
    }

    // Setup Hedera Agent Kit
    const allPlugins = [
      coreAccountPlugin,
      coreAccountQueryPlugin,
      coreConsensusPlugin,
      coreConsensusQueryPlugin,
      coreTokenPlugin,
      coreTokenQueryPlugin,
    ].filter((plugin) => plugin !== undefined && plugin !== null);

    const hederaAgentToolkit = new HederaLangchainToolkit({
      client,
      configuration: {
        mode: AgentMode.AUTONOMOUS,
        plugins: allPlugins,
      },
    });

    // Custom tools for A2A communication
    const bookHotelTool = new DynamicStructuredTool({
      name: "book_hotel",
      description:
        "Book a hotel by sending A2A message to hotel agent. Use this when user wants to book a hotel or accommodation.",
      schema: z.object({
        destination: z.string().describe("Destination city/location"),
        checkIn: z.string().describe("Check-in date (YYYY-MM-DD)"),
        checkOut: z.string().describe("Check-out date (YYYY-MM-DD)"),
        maxBudget: z.number().optional().describe("Maximum budget in HBAR"),
      }),
      func: async ({ destination, checkIn, checkOut, maxBudget }) => {
        if (hotelAgent && !hotelAgent.isListening) {
          hotelAgent.startListening();
        }

        const message = new A2AMessage(
          "request",
          {
            service: "hotel_booking",
            details: { destination, check_in: checkIn, check_out: checkOut },
            max_budget: maxBudget || 10,
          },
          "main-agent",
          process.env.HEDERA_ACCOUNT_ID
        );

        const messageString = JSON.stringify(message.toJSON());
        const submitTx = await new TopicMessageSubmitTransaction()
          .setTopicId(topicId)
          .setMessage(messageString)
          .execute(client);

        await submitTx.getReceipt(client);

        return `Hotel booking request sent to hotel agent. Destination: ${destination}, Check-in: ${checkIn}, Check-out: ${checkOut}. The hotel agent will respond with availability and pricing soon. Check the conversation for updates.`;
      },
    });

    const getInsuranceTool = new DynamicStructuredTool({
      name: "get_travel_insurance",
      description:
        "Get travel insurance quote by sending A2A message to insurance agent. Use when user wants travel insurance or trip protection.",
      schema: z.object({
        tripCost: z.number().describe("Total trip cost in HBAR"),
        destination: z.string().describe("Travel destination"),
      }),
      func: async ({ tripCost, destination }) => {
        if (insuranceAgent && !insuranceAgent.isListening) {
          insuranceAgent.startListening();
        }

        const message = new A2AMessage(
          "request",
          {
            service: "travel_insurance",
            trip_cost: tripCost,
            destination: destination,
          },
          "main-agent",
          process.env.HEDERA_ACCOUNT_ID
        );

        const messageString = JSON.stringify(message.toJSON());
        const submitTx = await new TopicMessageSubmitTransaction()
          .setTopicId(topicId)
          .setMessage(messageString)
          .execute(client);

        await submitTx.getReceipt(client);

        return `Insurance quote request sent to insurance agent for trip costing ${tripCost} HBAR to ${destination}. The insurance agent will respond with coverage options soon.`;
      },
    });

    // Combine all tools
    const tools = [
      ...hederaAgentToolkit.getTools(),
      bookHotelTool,
      getInsuranceTool,
    ];

    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are a smart AI travel assistant with FULL CONTROL over Hedera blockchain operations and multi-agent coordination.

CAPABILITIES:
1. **Standard Hedera Operations**: Transfer HBAR, create tokens, manage accounts, query balances
2. **Hotel Booking**: Use book_hotel tool when user wants to book hotels/accommodation
3. **Travel Insurance**: Use get_travel_insurance tool when user wants trip insurance/protection
4. **Multi-Agent Coordination**: You can activate specialized agents (hotel, insurance) on-demand

AGENT ACTIVATION LOGIC:
- User asks about hotels → Activate hotel agent via book_hotel tool
- User asks about insurance → Activate insurance agent via get_travel_insurance tool
- User asks other things → Use standard Hedera tools

Your account: ${process.env.HEDERA_ACCOUNT_ID}
A2A Topic: ${topicId}

Be conversational, helpful, and proactive. When agents respond, inform the user about their offers.`,
      ],
      ["placeholder", "{chat_history}"],
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"],
    ]);

    const agent = await createToolCallingAgent({ llm, tools, prompt });
    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: false,
      maxIterations: 15,
    });

    console.log(`✅ Smart AI Agent initialized!`);
    console.log(`🔑 Account: ${process.env.HEDERA_ACCOUNT_ID}`);
    console.log(
      `📦 Tools: ${tools.length} (${allPlugins.length} Hedera + 2 A2A)`
    );
    console.log(
      `🤖 Specialized Agents: ${hotelAgent ? "✅ Hotel" : "❌ Hotel"} | ${
        insuranceAgent ? "✅ Insurance" : "❌ Insurance"
      }\n`
    );

    const chatHistory = [];
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    console.log(
      '💬 Ready! Try: "I need to book a hotel" or "What\'s my balance?"\n'
    );

    const getUserInput = () => {
      return new Promise((resolve) => {
        rl.question("You: ", (answer) => {
          resolve(answer);
        });
      });
    };

    while (true) {
      try {
        const userInput = await getUserInput();

        if (userInput.toLowerCase().trim() === "exit") {
          console.log("\n👋 Goodbye!");
          rl.close();
          process.exit(0);
        }

        if (!userInput.trim()) continue;

        const response = await agentExecutor.invoke({
          input: userInput,
          chat_history: chatHistory,
        });

        console.log(`Agent: ${response.output}\n`);

        chatHistory.push(new HumanMessage(userInput));
        chatHistory.push(new AIMessage(response.output));

        if (chatHistory.length > 10) {
          chatHistory.splice(0, 2);
        }
      } catch (error) {
        console.error(`Agent: ❌ Error - ${error.message}\n`);
      }
    }
  } catch (error) {
    console.error("Failed to initialize:", error);
    process.exit(1);
  }
}

main().catch(console.error);
