const dotenv = require("dotenv");
dotenv.config();

const path = require("path");
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { AgentExecutor, createToolCallingAgent } = require("langchain/agents");
const {
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
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
const crypto = require("crypto");
const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static(path.join(__dirname, "public")));

// ---------- A2A Message ----------
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

// ---------- Specialized Agents ----------
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
    console.log("Hotel Agent listening...");

    const now = Math.floor(Date.now() / 1000);
    new TopicMessageQuery()
      .setTopicId(this.topicId)
      .setStartTime(now)
      .subscribe(this.client, null, (message) => {
        try {
          const msgStr = Buffer.from(message.contents).toString();
          const msg = JSON.parse(msgStr);
          if (msg.sender.account_id !== this.accountId) {
            this.handleMessage(msg);
          }
        } catch (err) {
          console.error("Error handling hotel message:", err);
        }
      });

    this.isListening = true;
  }

  async handleMessage(msg) {
    if (
      msg.message_type === "request" &&
      msg.content.service === "hotel_booking"
    ) {
      console.log("Hotel booking request received");
      setTimeout(async () => {
        const price = 3 * 2;
        await this.sendMessage("response", {
          status: "available",
          options: [
            {
              room_type: "Standard Room",
              price_per_night: 3,
              total_nights: 2,
              total_price: price,
              currency: "HBAR",
            },
          ],
          booking_reference: "HOTEL-" + crypto.randomUUID().substring(0, 8),
        });
        console.log("Hotel offer sent:", price, "HBAR");
      }, 1500);
    }
  }

  async sendMessage(type, content) {
    const msg = new A2AMessage(type, content, this.agentId, this.accountId);
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(JSON.stringify(msg))
      .execute(this.client);
    await tx.getReceipt(this.client);
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
    console.log("Insurance Agent listening...");

    const now = Math.floor(Date.now() / 1000);
    new TopicMessageQuery()
      .setTopicId(this.topicId)
      .setStartTime(now)
      .subscribe(this.client, null, (message) => {
        try {
          const msgStr = Buffer.from(message.contents).toString();
          const msg = JSON.parse(msgStr);
          if (msg.sender.account_id !== this.accountId) {
            this.handleMessage(msg);
          }
        } catch (err) {
          console.error("Error handling insurance message:", err);
        }
      });

    this.isListening = true;
  }

  async handleMessage(msg) {
    if (
      msg.message_type === "request" &&
      msg.content.service === "travel_insurance"
    ) {
      console.log("Insurance request received");
      setTimeout(async () => {
        const premium = parseFloat((msg.content.trip_cost * 0.15).toFixed(2));
        await this.sendMessage("response", {
          status: "available",
          coverage_options: [
            {
              tier: "Standard Coverage",
              premium: premium,
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
        console.log("Insurance quote sent:", premium, "HBAR");
      }, 1500);
    }
  }

  async sendMessage(type, content) {
    const msg = new A2AMessage(type, content, this.agentId, this.accountId);
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(JSON.stringify(msg))
      .execute(this.client);
    await tx.getReceipt(this.client);
  }
}

// ---------- LLM Setup ----------
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

// ---------- Main AI System ----------
async function initializeAgent() {
  const llm = createLLM();
  const client = Client.forTestnet().setOperator(
    process.env.HEDERA_ACCOUNT_ID,
    PrivateKey.fromStringED25519(process.env.HEDERA_PRIVATE_KEY),
  );
  const topicId = process.env.A2A_TOPIC_ID;

  let hotelAgent = null;
  let insuranceAgent = null;

  if (process.env.HOTEL_ACCOUNT_ID && process.env.HOTEL_PRIVATE_KEY) {
    const hotelKey = PrivateKey.fromStringDer(process.env.HOTEL_PRIVATE_KEY);
    const hotelClient = Client.forTestnet().setOperator(
      process.env.HOTEL_ACCOUNT_ID,
      hotelKey,
    );
    hotelAgent = new HotelAgent(
      process.env.HOTEL_ACCOUNT_ID,
      hotelKey,
      topicId,
      hotelClient,
    );
  }

  if (process.env.INSURANCE_ACCOUNT_ID && process.env.INSURANCE_PRIVATE_KEY) {
    const insKey = PrivateKey.fromStringDer(process.env.INSURANCE_PRIVATE_KEY);
    const insClient = Client.forTestnet().setOperator(
      process.env.INSURANCE_ACCOUNT_ID,
      insKey,
    );
    insuranceAgent = new InsuranceAgent(
      process.env.INSURANCE_ACCOUNT_ID,
      insKey,
      topicId,
      insClient,
    );
  }

  const toolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      mode: AgentMode.AUTONOMOUS,
      plugins: [
        coreAccountPlugin,
        coreAccountQueryPlugin,
        coreConsensusPlugin,
        coreConsensusQueryPlugin,
        coreTokenPlugin,
        coreTokenQueryPlugin,
      ],
    },
  });

  const bookHotelTool = new DynamicStructuredTool({
    name: "book_hotel",
    description: "Send hotel booking A2A request.",
    schema: z.object({
      destination: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      maxBudget: z.number().optional(),
    }),
    func: async ({ destination, checkIn, checkOut, maxBudget }) => {
      if (hotelAgent && !hotelAgent.isListening) hotelAgent.startListening();
      const msg = new A2AMessage(
        "request",
        {
          service: "hotel_booking",
          details: { destination, check_in: checkIn, check_out: checkOut },
          max_budget: maxBudget || 10,
        },
        "main-agent",
        process.env.HEDERA_ACCOUNT_ID,
      );
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(JSON.stringify(msg))
        .execute(client);
      await tx.getReceipt(client);
      return `Hotel booking request sent to ${destination}.`;
    },
  });

  const getInsuranceTool = new DynamicStructuredTool({
    name: "get_travel_insurance",
    description: "Send travel insurance A2A request.",
    schema: z.object({ tripCost: z.number(), destination: z.string() }),
    func: async ({ tripCost, destination }) => {
      if (insuranceAgent && !insuranceAgent.isListening)
        insuranceAgent.startListening();
      const msg = new A2AMessage(
        "request",
        { service: "travel_insurance", trip_cost: tripCost, destination },
        "main-agent",
        process.env.HEDERA_ACCOUNT_ID,
      );
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(JSON.stringify(msg))
        .execute(client);
      await tx.getReceipt(client);
      return `Insurance quote request sent for trip to ${destination} (${tripCost} HBAR).`;
    },
  });

  const tools = [...toolkit.getTools(), bookHotelTool, getInsuranceTool];

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a Hedera-connected AI travel assistant. Handle bookings, insurance, and on-chain tasks.
Account: ${process.env.HEDERA_ACCOUNT_ID}
Topic: ${topicId}.`,
    ],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = await createToolCallingAgent({ llm, tools, prompt });
  return new AgentExecutor({ agent, tools, verbose: false, maxIterations: 10 });
}

(async () => {
  const agentExecutor = await initializeAgent();
  const chatHistory = [];

  wss.on("connection", (ws) => {
    console.log("Client connected");

    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === "input") {
        const userInput = msg.content.trim();
        if (!userInput) return;

        const response = await agentExecutor.invoke({
          input: userInput,
          chat_history: chatHistory,
        });

        ws.send(
          JSON.stringify({
            sender: "agent",
            content: response.output,
          }),
        );

        chatHistory.push(new HumanMessage(userInput));
        chatHistory.push(new AIMessage(response.output));
        if (chatHistory.length > 10) chatHistory.splice(0, 2);
      }
    });

    ws.on("close", () => console.log("Client disconnected"));
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
})();
