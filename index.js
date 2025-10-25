// index.js - Autonomous Hedera Agent with Full Control (ES Module)
import dotenv from "dotenv";
dotenv.config();

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { Client, PrivateKey } from "@hashgraph/sdk";
import {
  HederaLangchainToolkit,
  coreAccountPlugin,
  coreAccountQueryPlugin,
  coreConsensusPlugin,
  coreConsensusQueryPlugin,
  coreTokenPlugin,
  coreTokenQueryPlugin,
  AgentMode,
} from "hedera-agent-kit";
import { ChatGroq } from "@langchain/groq";
import { ChatOllama } from "@langchain/ollama";
import readline from "readline";

// Choose your AI provider
function createLLM() {
  if (process.env.GROQ_API_KEY) {
    return new ChatGroq({ model: "llama-3.3-70b-versatile" });
  }

  // Ollama local fallback
  return new ChatOllama({
    model: "llama3.1",
    baseUrl: "http://localhost:11434",
  });
}

async function main() {
  try {
    // Initialize AI model
    const llm = createLLM();

    // Test LLM connection
    console.log("\n🔍 Testing LLM connection...");
    try {
      const testResponse = await Promise.race([
        llm.invoke("Test"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), 10000)
        ),
      ]);
      console.log("✅ LLM connection successful\n");
    } catch (error) {
      console.error("❌ LLM connection failed:", error.message);
      console.error(
        "⚠️  Check your GROQ_API_KEY or try using Ollama locally\n"
      );
      process.exit(1);
    }

    // Hedera client setup with your account credentials
    const client = Client.forTestnet().setOperator(
      process.env.HEDERA_ACCOUNT_ID,
      PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY)
    );

    // Filter out undefined plugins (only using available core plugins)
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

    // Configure toolkit with AUTONOMOUS mode and available plugins
    const hederaAgentToolkit = new HederaLangchainToolkit({
      client,
      configuration: {
        mode: AgentMode.AUTONOMOUS,
        plugins: allPlugins,
      },
    });

    // Create system prompt with permissions awareness
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are an autonomous Hedera blockchain agent with FULL TRANSACTION CONTROL.

You can execute ANY transaction on behalf of the user without requiring approval:
- Transfer HBAR and tokens
- Create and manage tokens (fungible and NFT)
- Create and manage accounts
- Post messages to HCS topics
- Deploy and interact with smart contracts
- Schedule transactions
- Approve allowances
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

    // Get all tools from the toolkit
    const tools = hederaAgentToolkit.getTools();

    console.log(`\n🤖 Autonomous Hedera Agent Ready!`);
    console.log(`📋 Available tools: ${tools.length}`);
    console.log(`🔑 Operator Account: ${process.env.HEDERA_ACCOUNT_ID}`);
    console.log(`⚡ Mode: AUTONOMOUS (full transaction control)\n`);

    // Create the agent
    const agent = await createToolCallingAgent({
      llm,
      tools,
      prompt,
    });

    // Create executor (verbose enabled to see what's happening)
    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: true, // Enabled to debug output issues
      maxIterations: 15,
    });

    // Interactive mode - continuous input from terminal
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('💬 Ready for commands! (type "exit" to quit)\n');

    const processInput = (input) => {
      return new Promise((resolve) => {
        rl.question(input, resolve);
      });
    };

    // Continuous chat loop
    while (true) {
      try {
        const userInput = await processInput("You: ");

        if (userInput.toLowerCase().trim() === "exit") {
          console.log("\n👋 Shutting down agent. Goodbye!");
          rl.close();
          process.exit(0);
        }

        if (!userInput.trim()) {
          continue; // Skip empty inputs
        }

        console.log("\n🤖 Processing...\n");

        const result = await agentExecutor.invoke({ input: userInput });
        console.log("Agent:", result.output, "\n");
      } catch (error) {
        console.error("❌ Error:", error.message, "\n");
      }
    }
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
