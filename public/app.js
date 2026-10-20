async function fetchMetrics() {
  try {
    const res = await fetch("/metrics");
    const text = await res.text();

    const total = extractMetric(text, "api_requests_total");
    const blocked = extractMetric(text, "api_requests_blocked_total");
    const latencySum = extractMetric(text, "api_request_latency_ms_sum");
    const latencyCount = extractMetric(text, "api_request_latency_ms_count");

    document.getElementById("totalRequests").innerText = total ?? "-";
    document.getElementById("blockedRequests").innerText = blocked ?? "-";

    if (latencySum && latencyCount && latencyCount > 0) {
      const avg = (latencySum / latencyCount).toFixed(1);
      document.getElementById("avgLatency").innerText = avg;
    }
  } catch {
    // Ignore temporary fetch failures
  }
}

function extractMetric(metricsText, name) {
  const line = metricsText
    .split("\n")
    .find(l => l.startsWith(name + " "));
  if (!line) return null;
  return Number(line.split(" ")[1]);
}

async function loadConfig() {
  const res = await fetch("/admin/config");
  const config = await res.json();

  document.getElementById("rateLimit").value = config.rateLimit;
  document.getElementById("windowSeconds").value = config.windowSeconds;
}

async function saveConfig() {
  const rateLimit = Number(document.getElementById("rateLimit").value);
  const windowSeconds = Number(document.getElementById("windowSeconds").value);

  const res = await fetch("/admin/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rateLimit,
      windowSeconds,
      algorithm: "sliding"
    })
  });

  const status = document.getElementById("configStatus");

  if (res.ok) {
    status.innerText = "Configuration saved successfully.";
  } else {
    status.innerText = "Failed to update configuration.";
  }
}

async function sendTraffic() {
  const userId = document.getElementById("userId").value;
  const count = Number(document.getElementById("requestCount").value);
  const output = document.getElementById("trafficOutput");

  output.innerText = "";

  for (let i = 0; i < count; i++) {
    try {
      const res = await fetch(`/api/request?userId=${userId}`);
      const data = await res.json();
      output.innerText += JSON.stringify(data) + "\n";
    } catch {
      output.innerText += "Request failed\n";
    }
  }
}

document.getElementById("saveConfig").addEventListener("click", saveConfig);
document.getElementById("sendTraffic").addEventListener("click", sendTraffic);

// Initial load
loadConfig();
fetchMetrics();
setInterval(fetchMetrics, 2000);
