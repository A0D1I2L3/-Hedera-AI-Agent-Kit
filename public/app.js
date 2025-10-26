document.addEventListener("DOMContentLoaded", () => {
  const chatBox = document.getElementById("chat-box");
  const messageInput = document.getElementById("message-input");
  const sendButton = document.getElementById("send-button");
  const statusLight = document.getElementById("status-light");
  const statusText = document.getElementById("status-text");

  // Establish WebSocket connection with our server.js
  // Use wss:// if your server is on HTTPS
  const ws = new WebSocket(`ws://${window.location.host}`);

  function setStatus(status, text) {
    statusLight.className = status;
    statusText.textContent = text;
  }

  ws.onopen = () => {
    console.log("WebSocket connected");
    setStatus("connected", "Connected");
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      addMessage(message.sender, message.content);
    } catch (e) {
      console.error("Received non-JSON message:", event.data);
      addMessage("system", event.data);
    }
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected");
    setStatus("disconnected", "Disconnected");
    messageInput.disabled = true;
    sendButton.disabled = true;
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    addMessage("error", "A connection error occurred.");
  };

  function addMessage(sender, content) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", `${sender}-message`);
    messageDiv.textContent = content.trim();
    chatBox.appendChild(messageDiv);

    // Auto-scroll to the bottom
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function sendMessage() {
    const content = messageInput.value.trim();
    if (content) {
      // Send the user's message to the server
      ws.send(JSON.stringify({ type: "input", content: content }));

      // We add the user's message to the chat immediately
      // The server will echo it back, but we can also just show it now.
      // Our server.js logic filters out the "You: " prompt,
      // but we'll add the user message here for a snappier UI.
      addMessage("user", content);

      messageInput.value = "";
    }
  }

  sendButton.addEventListener("click", sendMessage);
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  });
});
