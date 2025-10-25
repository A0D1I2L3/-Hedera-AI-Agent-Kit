const dotenv = require("dotenv");
dotenv.config();

const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { AgentExecutor, createToolCallingAgent } = require("langchain/agents");
const { Client, PrivateKey } = require("@hashgraph/sdk");
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

// Choose your AI provider
function createLLM() {
  // Option 1: OpenAI (requires OPENAI_API_KEY in .env)
  if (process.env.OPENAI_API_KEY) {
    const { ChatOpenAI } = require("@langchain/openai");
    console.log("🔑 Using OpenAI");
    return new ChatOpenAI({ model: "gpt-4o-mini" });
  }

  // Option 2: Anthropic Claude (requires ANTHROPIC_API_KEY in .env)
  if (process.env.ANTHROPIC_API_KEY) {
    const { ChatAnthropic } = require("@langchain/anthropic");
    console.log("🔑 Using Anthropic Claude");
    return new ChatAnthropic({ model: "claude-3-haiku-20240307" });
  }

  // Option 3: Groq (requires GROQ_API_KEY in .env)
  if (process.env.GROQ_API_KEY) {
    const { ChatGroq } = require("@langchain/groq");
    console.log("🔑 Using Groq");
    return new ChatGroq({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.7,
    });
  }

  // Option 4: Ollama (free, local - requires Ollama installed and running)
  try {
    const { ChatOllama } = require("@langchain/ollama");
    console.log("🏠 Using Ollama locally");
    return new ChatOllama({
      model: "llama3.2",
      baseUrl: "http://localhost:11434",
    });
  } catch (e) {
    console.error("No AI provider configured. Please either:");
    console.error(
      "1. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY in .env",
    );
    console.error("2. Install and run Ollama locally (https://ollama.com)");
    process.exit(1);
  }
}

async function main() {
  try {
    // Initialize AI model
    const llm = createLLM();

    // Clean up the private key (remove quotes and 0x prefix)
    let privateKeyString = process.env.HEDERA_PRIVATE_KEY.trim();
    privateKeyString = privateKeyString.replace(/^["']|["']$/g, ""); // Remove quotes
    privateKeyString = privateKeyString.replace(/^0x/i, ""); // Remove 0x prefix

    // Try to parse the private key (supports both ECDSA and ED25519)
    let privateKey;
    try {
      // Try ECDSA first
      privateKey = PrivateKey.fromStringECDSA(privateKeyString);
    } catch (e) {
      // If that fails, try ED25519
      privateKey = PrivateKey.fromString(privateKeyString);
    }

    // Hedera client setup (Testnet by default)
    const client = Client.forTestnet().setOperator(
      process.env.HEDERA_ACCOUNT_ID,
      privateKey,
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

    console.log(`\n📦 Loading ${allPlugins.length} plugins...`);
    allPlugins.forEach((plugin) => {
      console.log(`   ✓ ${plugin.name}`);
    });

    const hederaAgentToolkit = new HederaLangchainToolkit({
      client,
      configuration: {
        mode: AgentMode.AUTONOMOUS,
        plugins: allPlugins,
      },
    });

    // Load the structured chat prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are an autonomous Hedera blockchain agent with FULL TRANSACTION CONTROL.

You can execute ANY transaction on behalf of the user without requiring approval:
- Transfer HBAR and tokens
- Create and manage tokens (fungible and NFT)
- Create and manage accounts
- Post messages to HCS topics
- Query account balances and transaction history
- And more...

The operator account is: ${process.env.HEDERA_ACCOUNT_ID}

IMPORTANT: You will automatically execute transactions. Always:
1. Confirm the action before executing
2. Provide clear transaction IDs after execution
3. Handle errors gracefully and explain what went wrong

Be helpful but cautious with high-value transactions.`,
      ],
      ["placeholder", "{chat_history}"],
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"],
    ]);

    // Fetch tools from toolkit
    const tools = hederaAgentToolkit.getTools();

    console.log(`\n🤖 Autonomous Hedera Agent Ready!`);
    console.log(`📋 Available tools: ${tools.length}`);
    console.log(`🔑 Operator Account: ${process.env.HEDERA_ACCOUNT_ID}`);
    console.log(`⚡ Mode: AUTONOMOUS (full transaction control)\n`);

    // Create the underlying agent
    const agent = await createToolCallingAgent({
      llm,
      tools,
      prompt,
    });

    // Wrap everything in an executor that will maintain memory
    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: true,
      maxIterations: 15,
    });

    // Chat history to maintain context
    const chatHistory = [];

    // Interactive mode - continuous input from terminal
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    console.log('💬 Ready for commands! (type "exit" to quit)\n');

    // Helper function to get user input
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
          console.log("\n👋 Shutting down agent. Goodbye!");
          rl.close();
          process.exit(0);
        }

        if (!userInput.trim()) {
          continue; // Skip empty inputs
        }

        console.log("\n🤖 Processing...\n");

        const response = await agentExecutor.invoke({
          input: userInput,
          chat_history: chatHistory,
        });

        // Add to chat history for context
        chatHistory.push(new HumanMessage(userInput));
        chatHistory.push(new AIMessage(response.output));

        // Keep chat history manageable (last 10 messages)
        if (chatHistory.length > 10) {
          chatHistory.splice(0, 2);
        }

        console.log("\nAgent:", response.output, "\n");
      } catch (error) {
        console.error("❌ Error:", error.message);
        console.log(); // Empty line for spacing
      }
    }
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
