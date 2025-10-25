const dotenv = require("dotenv");
dotenv.config();
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { AgentExecutor, createToolCallingAgent } = require("langchain/agents");
const { Client, PrivateKey } = require("@hashgraph/sdk");
const {
  HederaLangchainToolkit,
  coreQueriesPlugin,
} = require("hedera-agent-kit");

// Choose your AI provider (install the one you want to use)
function createLLM() {
  // Option 1: OpenAI (requires OPENAI_API_KEY in .env)
  if (process.env.OPENAI_API_KEY) {
    const { ChatOpenAI } = require("@langchain/openai");
    return new ChatOpenAI({ model: "gpt-4o-mini" });
  }

  // Option 2: Anthropic Claude (requires ANTHROPIC_API_KEY in .env)
  if (process.env.ANTHROPIC_API_KEY) {
    const { ChatAnthropic } = require("@langchain/anthropic");
    return new ChatAnthropic({ model: "claude-3-haiku-20240307" });
  }

  // Option 3: Groq (requires GROQ_API_KEY in .env)
  if (process.env.GROQ_API_KEY) {
    const { ChatGroq } = require("@langchain/groq");
    return new ChatGroq({ model: "llama-3.3-70b-versatile" });
  }

  // Option 4: Ollama (free, local - requires Ollama installed and running)
  try {
    const { ChatOllama } = require("@langchain/ollama");
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

  const hederaAgentToolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      plugins: [coreQueriesPlugin], // all our core plugins here https://github.com/hedera-dev/hedera-agent-kit/tree/main/typescript/src/plugins
    },
  });

  // Load the structured chat prompt template
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful assistant"],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  // Fetch tools from toolkit
  const tools = hederaAgentToolkit.getTools();

  // Create the underlying agent
  const agent = createToolCallingAgent({
    llm,
    tools,
    prompt,
  });

  // Wrap everything in an executor that will maintain memory
  const agentExecutor = new AgentExecutor({
    agent,
    tools,
  });

  const response = await agentExecutor.invoke({
    input: "can you do transactions",
  });
  console.log(response);
}

main().catch(console.error);
