# AgentH
![Banner](banner.jpg)

**Autonomous AI agents on Hedera** enabling decentralized travel booking and insurance quotes through multi-agent coordination.

Build AI-powered applications where independent agents communicate over Hedera's Consensus Service to perform tasks — entirely on-chain and without centralized servers.

---

## Overview

**AgentH** demonstrates autonomous-to-autonomous (A2A) communication, where specialized AI agents act as independent economic participants:

- **Decentralized Travel Booking** — Hotel search and reservation through agent coordination
- **On-Chain Insurance Quotes** — Travel insurance pricing via specialized agents
- **Verifiable Agent Communication** — All inter-agent messages recorded immutably on HCS
- **Real-Time Interaction** — WebSocket-based chat interface for natural language requests
- **Multi-Agent Coordination** — Specialized sub-agents work together transparently

---

## Screenshots

![Insurance Booking Chat](ss1.jpg)
*Natural language insurance quote request and AI agent response*

![Hotel Booking - Search Results](ss2.jpeg)
*Hotel agent presenting available options with pricing and details*

![Hotel Booking - Selection](ss3.jpeg)
*Continuing hotel booking flow with agent recommendations*

![HashScan Transaction](ss4.jpeg)
*Completed hotel booking verified on Hedera HashScan explorer*

---

## Key Features

### Multi-Agent Coordination
Ask your agent in plain English:
- "Find me a hotel in Paris for next weekend under $200/night"
- "Get travel insurance quotes for my Tokyo trip"
- "Compare hotel options and recommend the best value"
- Agents coordinate over Hedera Topics, creating verifiable decision trails

### On-Chain Service Execution
- **Decentralized Booking** — No centralized server; agents coordinate directly
- **Immutable Agreements** — All negotiations recorded on HCS
- **Transparent Pricing** — Every quote visible on-chain
- **HashScan Verification** — All transactions viewable on Hedera's explorer

### Built on Hedera Agent Kit
Powered by **Hedera AI Agent Kit** and **ElizaOS framework**:
- **LangChain Integration** — Natural language understanding via Groq/Ollama LLMs
- **Hedera JavaScript SDK** — Direct network interaction
- **WebSocket API** — Real-time bidirectional communication
- **Agent Runtime** — Autonomous decision-making and task delegation

### Framework Integrations
- **LangChain** — Build conversational AI agents
- **ElizaOS** — Agent orchestration framework
- **Model Context Protocol (MCP)** — Connect AI models to Hedera services

---

## Technical Stack

**Backend:**
- Node.js + Express
- ElizaOS agent orchestration
- Hedera AI Agent Kit
- WebSocket server

**Frontend:**
- React + Tailwind CSS
- WebSocket client
- Transaction visualization

**AI Layer:**
- LangChain for reasoning
- Groq/Ollama LLM
- Intent recognition

**Blockchain:**
- Hedera Consensus Service (HCS)
- Hedera JavaScript SDK
- HashScan integration

---

## Use Cases Beyond Travel

The AgentH pattern enables decentralized coordination for:
- **Supply Chain Management** — Autonomous logistics agents
- **Insurance Claims** — Multi-party verification agents
- **Marketplace Operations** — Buyer and seller agents negotiating
- **Service Coordination** — Specialized agents on complex tasks

---

## Why It Matters

AgentH proves autonomous agents can coordinate complex services entirely on-chain:

✅ **No Centralized Server** — Agents are independent participants
✅ **Verifiable Coordination** — Every message recorded immutably on Hedera
✅ **Transparent Economics** — All pricing visible on HashScan
✅ **Trustless Execution** — No single point of control

This is a blueprint for **agent-to-agent economies** where AI participants transact as peers, with Hedera providing trustless infrastructure.

---

## Built At

**ETHOnline 2025** — Exploring the future of autonomous agent economies on Hedera

## Get Started

Follow these steps to set up your environment and run the agents.

### Setting Up Environment Variables (.env)

This project uses environment variables to securely manage your Hedera account credentials and agent configurations.

1.  **Create the .env file:**
    In the root directory of the project, create a new file named `.env`.

2.  **Add Your Main Hedera Credentials:**
    You need a Hedera testnet account. Get your Account ID and Private Key from the [Hedera Portal](https://portal.hedera.com/). Add them to your `.env` file.

    ```bash
    # Add your personal Hedera Account ID and Private Key
    HEDERA_ACCOUNT_ID="YOUR_ACCOUNT_ID"
    HEDERA_PRIVATE_KEY="YOUR_PRIVATE_KEY"
    ```
    *Example format:*
    ```bash
    # HEDERA_ACCOUNT_ID="0.0.xxxxxxx"
    # HEDERA_PRIVATE_KEY="0xXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    ```

3.  **Create the Main Agent Topic:**
    Run the `createTopic.js` script to create the main topic for agent-to-agent (A2A) communication.

    ```bash
    node createTopic.js
    ```

4.  **Add Agent and Topic IDs:**
    After running the script, add the following lines to your `.env` file. These are used to identify the main travel agent and its communication topic.

    ```bash
    AGENT_ID=hedera-travel-agent
    A2A_TOPIC_ID=0.0.x
    ```

5.  **Create Sub-Agents (Hotel & Insurance):**
    Run the scripts to create the dedicated hotel and insurance agents.

    ```bash
    node createHotelAgent.js
    node createInsuranceAgent.js
    ```

6.  **Add Sub-Agent Credentials:**
    Finally, add the credentials for the newly created agents to your `.env` file. These are pre-defined for this example.

    ```bash
    HOTEL_ACCOUNT_ID="0.0.xxxxxxx"
    HOTEL_PRIVATE_KEY="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    INSURANCE_ACCOUNT_ID="0.0.xxxxxxx"
    INSURANCE_PRIVATE_KEY="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    ```

Your final `.env` file should look similar to this (with your own credentials at the top):

```bash
# Your personal account from Hedera Portal
HEDERA_ACCOUNT_ID="0.0.xxxxxxx"
HEDERA_PRIVATE_KEY="0x................"

# Main agent identifiers
AGENT_ID=hedera-travel-agent
A2A_TOPIC_ID=0.0.xxxxxxx

# Sub-agent credentials
HOTEL_ACCOUNT_ID="0.0.xxxxxxx"
HOTEL_PRIVATE_KEY="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
INSURANCE_ACCOUNT_ID="0.0.xxxxxxx"
INSURANCE_PRIVATE_KEY="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
