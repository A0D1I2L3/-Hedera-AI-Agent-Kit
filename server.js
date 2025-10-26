const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve the static frontend files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Handle WebSocket connections
wss.on("connection", (ws) => {
  console.log("Client connected via WebSocket");

  // Spawn your agent.js script as a child process
  // We use 'node -u' for unbuffered output, which gives us data line-by-line
  const agentProcess = spawn("node", ["index.js"]);

  // 1. Send data from the Agent's terminal (stdout) to the Frontend
  agentProcess.stdout.on("data", (data) => {
    const output = data.toString();
    // Clean up the output and determine the "sender"
    output.split("\n").forEach((line) => {
      if (line.trim()) {
        let sender = "system"; // Default
        let content = line;

        if (line.startsWith("Agent: ")) {
          sender = "agent";
          content = line.substring(7); // Remove "Agent: " prefix
        } else if (line.startsWith("You: ")) {
          // This is the agent's prompt, we don't need to send it to the frontend
          return;
        } else if (
          line.startsWith("🏨") ||
          line.startsWith("📥") ||
          line.startsWith("✅") ||
          line.startsWith("❌") ||
          line.startsWith("💰")
        ) {
          sender = "hotel";
        } else if (line.startsWith("🛡️")) {
          sender = "insurance";
        }

        ws.send(JSON.stringify({ sender, content }));
      }
    });
  });

  // 2. Send data from the Agent's error output (stderr) to the Frontend
  agentProcess.stderr.on("data", (data) => {
    ws.send(JSON.stringify({ sender: "error", content: data.toString() }));
  });

  // 3. Send data from the Frontend (ws) to the Agent's terminal (stdin)
  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      if (parsedMessage.type === "input") {
        // Send the user's message directly to the agent's stdin
        // The '\n' is crucial as it simulates pressing 'Enter'
        agentProcess.stdin.write(parsedMessage.content + "\n");
      }
    } catch (e) {
      console.error("Failed to parse message or write to stdin:", e);
    }
  });

  // 4. Handle cleanup when connections close
  agentProcess.on("close", (code) => {
    console.log(`Agent process exited with code ${code}`);
    ws.send(
      JSON.stringify({ sender: "system", content: "Agent has disconnected." }),
    );
    ws.close();
  });

  ws.on("close", () => {
    console.log("Client disconnected. Terminating agent process...");
    // Kill the child process if the browser tab is closed
    agentProcess.kill();
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Frontend server running at http://localhost:${PORT}`);
  console.log("Waiting for a client to connect and start the agent...");
});
