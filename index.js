const dotenv = require("dotenv");
dotenv.config();

const http = require("http");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");
const path = require("path");

const {
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
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

const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { AgentExecutor, createToolCallingAgent } = require("langchain/agents");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const crypto = require("crypto");

// ------------------- Helper Class -------------------
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

// ------------------- Hotel Agent -------------------
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
    console.log("🏨 Hotel Agent listening...");
    const now = Math.floor(Date.now() / 1000);
    new TopicMessageQuery()
      .setTopicId(this.topicId)
      .setStartTime(now)
      .subscribe(this.client, null, (message) => {
        try {
          const msg = JSON.parse(Buffer.from(message.contents).toString());
          if (msg.sender.account_id !== this.accountId) this.handleMessage(msg);
        } catch {}
      });
    this.isListening = true;
  }

  async handleMessage(message) {
    if (
      message.message_type === "request" &&
      message.content.service === "hotel_booking"
    ) {
      console.log("📥 Hotel Agent: booking request received");
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
        });
        console.log(`✅ Hotel Agent: offer sent (${totalPrice} HBAR)`);
      }, 1500);
    }
  }

  async sendMessage(type, content) {
    const msg = new A2AMessage(type, content, this.agentId, this.accountId);
    await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(JSON.stringify(msg.toJSON()))
      .execute(this.client);
  }
}

// ------------------- Insurance Agent -------------------
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
    console.log("🛡️ Insurance Agent listening...");
    const now = Math.floor(Date.now() / 1000);
    new TopicMessageQuery()
      .setTopicId(this.topicId)
      .setStartTime(now)
      .subscribe(this.client, null, (message) => {
        try {
          const msg = JSON.parse(Buffer.from(message.contents).toString());
          if (msg.sender.account_id !== this.accountId) this.handleMessage(msg);
        } catch {}
      });
    this.isListening = true;
  }

  async handleMessage(message) {
    if (
      message.message_type === "request" &&
      message.content.service === "travel_insurance"
    ) {
      console.log("📥 Insurance Agent: insurance request received");
      setTimeout(async () => {
        const tripCost = message.content.trip_cost || 10;
        const premium = parseFloat((tripCost * 0.15).toFixed(2));
        await this.sendMessage("response", {
          status: "available",
          premium,
          currency: "HBAR",
        });
        console.log(`✅ Insurance Agent: quote sent (${premium} HBAR)`);
      }, 1500);
    }
  }

  async sendMessage(type, content) {
    const msg = new A2AMessage(type, content, this.agentId, this.accountId);
    await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(JSON.stringify(msg.toJSON()))
      .execute(this.client);
  }
}

// ------------------- LLM Provider -------------------
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

// ------------------- Setup Web Server -------------------
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static(path.join(__dirname, "public")));

// ------------------- Main -------------------
(async () => {
  console.log("\n🤖 Initializing Smart AI Agent System...\n");
  const llm = createLLM();

  // Hedera setup
  let privKeyStr = process.env.HEDERA_PRIVATE_KEY.trim().replace(
    /^["']|["']$/g,
    "",
  );
  let privateKey;
  try {
    privateKey = PrivateKey.fromStringECDSA(privKeyStr);
  } catch {
    privateKey = PrivateKey.fromString(privKeyStr);
  }

  const client = Client.forTestnet().setOperator(
    process.env.HEDERA_ACCOUNT_ID,
    privateKey,
  );
  const topicId = process.env.A2A_TOPIC_ID;

  // Initialize sub-agents
  const hotelAgent = new HotelAgent(
    process.env.HOTEL_ACCOUNT_ID,
    privateKey,
    topicId,
    client,
  );
  const insuranceAgent = new InsuranceAgent(
    process.env.INSURANCE_ACCOUNT_ID,
    privateKey,
    topicId,
    client,
  );
  hotelAgent.startListening();
  insuranceAgent.startListening();

  // Hedera Toolkit + tools
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

  const tools = [
    ...toolkit.getTools(),
    new DynamicStructuredTool({
      name: "book_hotel",
      description: "Book hotel via A2A",
      schema: z.object({
        destination: z.string(),
        checkIn: z.string(),
        checkOut: z.string(),
      }),
      func: async ({ destination, checkIn, checkOut }) => {
        const msg = new A2AMessage(
          "request",
          {
            service: "hotel_booking",
            details: { destination, check_in: checkIn, check_out: checkOut },
          },
          "main-agent",
          process.env.HEDERA_ACCOUNT_ID,
        );
        await new TopicMessageSubmitTransaction()
          .setTopicId(topicId)
          .setMessage(JSON.stringify(msg.toJSON()))
          .execute(client);
        return `Hotel booking request sent for ${destination}.`;
      },
    }),
    new DynamicStructuredTool({
      name: "get_travel_insurance",
      description: "Request travel insurance via A2A",
      schema: z.object({ tripCost: z.number(), destination: z.string() }),
      func: async ({ tripCost, destination }) => {
        const msg = new A2AMessage(
          "request",
          { service: "travel_insurance", trip_cost: tripCost, destination },
          "main-agent",
          process.env.HEDERA_ACCOUNT_ID,
        );
        await new TopicMessageSubmitTransaction()
          .setTopicId(topicId)
          .setMessage(JSON.stringify(msg.toJSON()))
          .execute(client);
        return `Insurance request sent for ${destination}.`;
      },
    }),
  ];

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are a Hedera-enabled AI travel agent with hotel and insurance assistants.",
    ],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = await createToolCallingAgent({ llm, tools, prompt });
  const agentExecutor = new AgentExecutor({ agent, tools });
  console.log(
    "✅ Smart AI Agent initialized and ready for WebSocket connections\n",
  );

  // --- WebSocket Chat Interface ---
  wss.on("connection", (ws) => {
    console.log("Client connected via WebSocket");
    const chatHistory = [];

    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        msg = { type: "input", content: raw.toString() };
      }

      if (msg.type === "input" && msg.content) {
        const response = await agentExecutor.invoke({
          input: msg.content,
          chat_history: chatHistory,
        });

        chatHistory.push(new HumanMessage(msg.content));
        chatHistory.push(new AIMessage(response.output));

        ws.send(JSON.stringify({ sender: "agent", content: response.output }));
      }

      // broadcast to other clients (no echo)
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ sender: "user", content: msg.content }));
        }
      });
    });

    ws.on("close", () => console.log("Client disconnected"));
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () =>
    console.log(`🌐 Server running at http://localhost:${PORT}`),
  );
})();
