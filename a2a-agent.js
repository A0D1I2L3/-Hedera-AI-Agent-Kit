const dotenv = require("dotenv");
dotenv.config();

const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { AgentExecutor, createToolCallingAgent } = require("langchain/agents");
const {
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction,
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

// A2A Message Schema (based on A2A Protocol specification)
class A2AMessage {
  constructor(type, content, metadata = {}) {
    this.id = crypto.randomUUID();
    this.timestamp = new Date().toISOString();
    this.protocol_version = "1.0";
    this.message_type = type; // 'request', 'response', 'negotiation', 'payment'
    this.sender = {
      agent_id: process.env.AGENT_ID || "hedera-travel-agent",
      account_id: process.env.HEDERA_ACCOUNT_ID,
    };
    this.content = content;
    this.metadata = {
      ...metadata,
      hedera_network: "testnet",
    };
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      protocol_version: this.protocol_version,
      message_type: this.message_type,
      sender: this.sender,
      content: this.content,
      metadata: this.metadata,
    };
  }

  toString() {
    return JSON.stringify(this.toJSON(), null, 2);
  }

  static fromJSON(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    const msg = new A2AMessage(data.message_type, data.content, data.metadata);
    msg.id = data.id;
    msg.timestamp = data.timestamp;
    msg.sender = data.sender;
    return msg;
  }
}

// A2A Payment Request (AP2 Integration)
class A2APaymentRequest extends A2AMessage {
  constructor(amount, currency, recipient, description) {
    super("payment", {
      amount,
      currency, // e.g., "HBAR" or token ID "0.0.xxxxx"
      recipient,
      description,
      payment_method: "hedera_token_transfer",
    });
  }
}

// Choose your AI provider
function createLLM() {
  if (process.env.GROQ_API_KEY) {
    const { ChatGroq } = require("@langchain/groq");
    return new ChatGroq({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.7,
    });
  }

  try {
    const { ChatOllama } = require("@langchain/ollama");
    return new ChatOllama({
      model: "llama3.2",
      baseUrl: "http://localhost:11434",
    });
  } catch (e) {
    console.error("No AI provider configured.");
    process.exit(1);
  }
}

// A2A Message Handler
class A2AMessageHandler {
  constructor(client, agentExecutor, topicId) {
    this.client = client;
    this.agentExecutor = agentExecutor;
    this.topicId = topicId;
    this.messageHistory = [];
  }

  // Send A2A message via HCS (Hedera Consensus Service)
  async sendMessage(message) {
    try {
      // Convert message to JSON string for HCS
      const messageJson = JSON.stringify(message.toJSON());

      console.log(`\n📤 Sending A2A Message to Topic ${this.topicId}`);
      console.log(`   Type: ${message.message_type}`);
      console.log(`   ID: ${message.id}`);

      const submitTx = await new TopicMessageSubmitTransaction()
        .setTopicId(this.topicId)
        .setMessage(messageJson)
        .execute(this.client);

      const receipt = await submitTx.getReceipt(this.client);

      console.log(
        `   ✅ Message sent! Sequence: ${receipt.topicSequenceNumber}`
      );
      console.log(`   Transaction: ${submitTx.transactionId.toString()}\n`);

      this.messageHistory.push({
        direction: "outbound",
        message,
        timestamp: new Date(),
      });

      return receipt;
    } catch (error) {
      console.error(`❌ Failed to send A2A message:`, error.message);
      throw error;
    }
  }

  // Process incoming A2A messages
  async handleIncomingMessage(messageData) {
    try {
      const a2aMessage = A2AMessage.fromJSON(messageData);

      console.log(`\n📥 Received A2A Message`);
      console.log(`   From: ${a2aMessage.sender.agent_id}`);
      console.log(`   Type: ${a2aMessage.message_type}`);
      console.log(`   ID: ${a2aMessage.id}\n`);

      this.messageHistory.push({
        direction: "inbound",
        message: a2aMessage,
        timestamp: new Date(),
      });

      // Route message based on type
      switch (a2aMessage.message_type) {
        case "request":
          return await this.handleRequest(a2aMessage);
        case "negotiation":
          return await this.handleNegotiation(a2aMessage);
        case "payment":
          return await this.handlePayment(a2aMessage);
        default:
          console.log(
            `   ⚠️  Unknown message type: ${a2aMessage.message_type}`
          );
      }
    } catch (error) {
      console.error(`❌ Error handling incoming message:`, error.message);
    }
  }

  async handleRequest(message) {
    console.log(`   🤖 Processing request with AI agent...`);

    // Use the Hedera agent to process the request
    const response = await this.agentExecutor.invoke({
      input: `A2A Request from ${message.sender.agent_id}: ${JSON.stringify(
        message.content
      )}`,
    });

    // Send response
    const responseMessage = new A2AMessage("response", {
      request_id: message.id,
      response: response.output,
    });

    await this.sendMessage(responseMessage);
    return responseMessage;
  }

  async handleNegotiation(message) {
    console.log(`   💬 Negotiation message received`);
    // Process negotiation logic here
    return message;
  }

  async handlePayment(message) {
    console.log(`   💰 Payment request received`);
    console.log(
      `   Amount: ${message.content.amount} ${message.content.currency}`
    );
    console.log(`   Recipient: ${message.content.recipient}`);

    // Auto-execute payment if amount is under threshold
    const threshold = parseFloat(process.env.AUTO_PAYMENT_THRESHOLD || "10");
    const amount = parseFloat(message.content.amount);

    if (amount <= threshold) {
      console.log(`   ✅ Auto-approving payment (under threshold)`);
      // Execute payment via Hedera agent
      const paymentResult = await this.agentExecutor.invoke({
        input: `Transfer ${message.content.amount} ${message.content.currency} to ${message.content.recipient} for: ${message.content.description}`,
      });

      return paymentResult;
    } else {
      console.log(
        `   ⚠️  Payment exceeds threshold - requires manual approval`
      );
      return null;
    }
  }
}

async function main() {
  try {
    console.log("\n🚀 Initializing A2A-Compatible Hedera Agent\n");

    // Initialize AI model
    const llm = createLLM();

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

    // Hedera client setup
    const client = Client.forTestnet().setOperator(
      process.env.HEDERA_ACCOUNT_ID,
      privateKey
    );

    // Filter out undefined plugins
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

    // Enhanced prompt for A2A protocol
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are an A2A-compatible Hedera Travel Agent with FULL TRANSACTION CONTROL.

AGENT IDENTITY:
- Agent ID: ${process.env.AGENT_ID || "hedera-travel-agent"}
- Account: ${process.env.HEDERA_ACCOUNT_ID}
- Network: Hedera Testnet

CAPABILITIES:
- Negotiate travel bookings with other agents via A2A protocol
- Send/receive structured A2A messages via Hedera Consensus Service (HCS)
- Execute payments using Hedera tokens (HBAR or custom tokens)
- Create and manage tokens for loyalty programs
- Process requests autonomously or with human-in-the-loop

A2A MESSAGE TYPES:
1. 'request' - Initial booking/service requests
2. 'response' - Replies to requests
3. 'negotiation' - Price/terms negotiation
4. 'payment' - Payment settlements via AP2

TRANSACTION GUIDELINES:
- Always provide transaction IDs and HashScan links
- For payments under ${
          process.env.AUTO_PAYMENT_THRESHOLD || 10
        } HBAR: auto-execute
- For larger payments: request human approval
- Handle errors gracefully and provide clear explanations

Be professional, efficient, and always prioritize security.`,
      ],
      ["placeholder", "{chat_history}"],
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"],
    ]);

    const tools = hederaAgentToolkit.getTools();
    const agent = await createToolCallingAgent({ llm, tools, prompt });
    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: false,
      maxIterations: 15,
    });

    console.log(`✅ Agent initialized successfully!`);
    console.log(
      `🔑 Agent ID: ${process.env.AGENT_ID || "hedera-travel-agent"}`
    );
    console.log(`🔑 Account: ${process.env.HEDERA_ACCOUNT_ID}`);
    console.log(`📦 Loaded ${allPlugins.length} Hedera plugins`);
    console.log(`⚡ Mode: AUTONOMOUS with A2A support\n`);

    // Initialize A2A Message Handler
    const topicId = process.env.A2A_TOPIC_ID || null;
    let a2aHandler = null;

    if (topicId) {
      a2aHandler = new A2AMessageHandler(client, agentExecutor, topicId);
      console.log(`📡 A2A Topic: ${topicId}`);
      console.log(
        `💰 Auto-payment threshold: ${
          process.env.AUTO_PAYMENT_THRESHOLD || 10
        } HBAR\n`
      );
    } else {
      console.log(`⚠️  No A2A_TOPIC_ID configured - A2A features disabled\n`);
    }

    // Chat history
    const chatHistory = [];

    // Interactive mode
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    console.log("💬 Commands:\n");
    console.log("   - Chat normally for regular operations");
    console.log('   - "a2a send <message>" - Send A2A message to topic');
    console.log('   - "a2a history" - View message history');
    console.log('   - "exit" - Quit\n');

    const getUserInput = () => {
      return new Promise((resolve) => {
        rl.question("You: ", (answer) => {
          resolve(answer);
        });
      });
    };

    // Continuous chat loop
    while (true) {
      try {
        const userInput = await getUserInput();

        if (userInput.toLowerCase().trim() === "exit") {
          console.log("\n👋 Shutting down A2A agent. Goodbye!");
          rl.close();
          process.exit(0);
        }

        if (!userInput.trim()) {
          continue;
        }

        // Handle A2A commands
        if (userInput.startsWith("a2a ")) {
          if (!a2aHandler) {
            console.log(
              "Agent: ❌ A2A not configured. Set A2A_TOPIC_ID in .env\n"
            );
            continue;
          }

          const a2aCommand = userInput.substring(4).trim();

          if (a2aCommand.startsWith("send ")) {
            const messageContent = a2aCommand.substring(5).trim();
            const message = new A2AMessage("request", {
              query: messageContent,
              requires_response: true,
            });
            await a2aHandler.sendMessage(message);
          } else if (a2aCommand === "history") {
            console.log("\n📋 A2A Message History:");
            a2aHandler.messageHistory.forEach((entry, idx) => {
              console.log(
                `   ${idx + 1}. [${entry.direction}] ${
                  entry.message.message_type
                } - ${entry.timestamp.toLocaleTimeString()}`
              );
            });
            console.log();
          } else {
            console.log(
              "Agent: Unknown A2A command. Try 'a2a send <message>' or 'a2a history'\n"
            );
          }
          continue;
        }

        // Regular agent interaction
        try {
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
        } catch (invokeError) {
          console.error(`Agent: ❌ Error - ${invokeError.message}\n`);
        }
      } catch (error) {
        console.error(`Agent: ❌ Fatal error - ${error.message}\n`);
      }
    }
  } catch (error) {
    console.error("Failed to initialize A2A agent:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
