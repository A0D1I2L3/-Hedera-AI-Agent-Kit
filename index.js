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
      "1. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY in .env"
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

IMPORTANT TOKEN CREATION RULES:
- When creating fungible tokens, ALWAYS ask for initial supply if not provided
- If user wants to mint tokens later, include supplyKey in token creation
- For viewing token balances, check on HashScan: https://hashscan.io/testnet/account/${process.env.HEDERA_ACCOUNT_ID}

TRANSACTION GUIDELINES:
1. Confirm the action before executing
2. Provide clear transaction IDs after execution
3. For token operations, always include the HashScan link
4. Handle errors gracefully and explain what went wrong

Be helpful but cautious with high-value transactions.`,
      ],
      ["placeholder", "{chat_history}"],
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"],
    ]);

    // Fetch tools from toolkit
    const tools = hederaAgentToolkit.getTools();

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
      verbose: false, // CRITICAL: Must be false for clean output
      maxIterations: 15,
    });

    console.log(`\n✅ Agent initialized successfully!`);
    console.log(`🔑 Account: ${process.env.HEDERA_ACCOUNT_ID}`);
    console.log(`📦 Loaded ${allPlugins.length} plugins`);
    console.log(`⚡ Mode: AUTONOMOUS\n`);

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

        try {
          const response = await agentExecutor.invoke({
            input: userInput,
            chat_history: chatHistory,
          });

          // Display clean output
          console.log(`Agent: ${response.output}\n`);

          // Add to chat history for context
          chatHistory.push(new HumanMessage(userInput));
          chatHistory.push(new AIMessage(response.output));

          // Keep chat history manageable (last 10 messages)
          if (chatHistory.length > 10) {
            chatHistory.splice(0, 2);
          }
        } catch (invokeError) {
          // Detailed error logging for debugging
          console.error(`Agent: ❌ Error occurred during execution\n`);
          console.error(`Error details: ${invokeError.message}\n`);

          // Check if it's a tool execution error
          if (invokeError.message.includes("content")) {
            console.log(
              `💡 Tip: Try rephrasing your request or provide the token ID explicitly.\n`
            );
          }
        }
      } catch (error) {
        console.error(`Agent: ❌ Fatal error - ${error.message}\n`);
      }
    }
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
