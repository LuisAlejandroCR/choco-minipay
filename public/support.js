const form = document.querySelector("[data-support-form]");
const result = document.querySelector("[data-support-result]");
const copyButton = document.querySelector("[data-copy-request]");
const topicButtons = document.querySelectorAll("[data-topic]");

function getField(name) {
  return form.elements.namedItem(name);
}

function buildSupportMessage() {
  const topic = getField("topic").value;
  const recipient = getField("recipient").value || "unknown recipient";
  const amount = getField("amount").value || "unknown amount";
  const route = getField("route").value || "unknown route";
  const timing = getField("timing").value || "unknown timing";
  const contact = getField("contact").value || "not provided yet";

  return [
    `Hi Choco support, I need help with: ${topic}.`,
    "",
    `Recipient: ${recipient}`,
    `Amount: ${amount}`,
    `Route: ${route}`,
    `Timing: ${timing}`,
    `Reply contact: ${contact}`,
    "",
    "What happened:",
    "Please review this transfer plan and tell me what to do next.",
  ].join("\n");
}

function syncMessage(force = false) {
  const message = getField("message");
  if (force || !message.dataset.edited) {
    message.value = buildSupportMessage();
  }
}

function showResult(text) {
  result.hidden = false;
  result.textContent = text;
}

if (form) {
  syncMessage(true);

  form.addEventListener("input", (event) => {
    if (event.target.name === "message") {
      event.target.dataset.edited = "true";
      return;
    }
    syncMessage();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    syncMessage();
    showResult("Request ready. Send this message through the Choco support chat channel.");
  });

  copyButton.addEventListener("click", async () => {
    syncMessage();
    const message = getField("message").value;
    try {
      await navigator.clipboard.writeText(message);
      showResult("Message copied. Paste it into the support chat.");
    } catch {
      getField("message").select();
      showResult("Copy is blocked in this browser. Select the message and copy it manually.");
    }
  });

  topicButtons.forEach((button) => {
    button.addEventListener("click", () => {
      getField("topic").value = button.dataset.topic;
      getField("message").dataset.edited = "";
      syncMessage(true);
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}
