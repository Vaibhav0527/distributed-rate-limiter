import http from "http";

const TARGET_URL = "http://localhost:3000/api/request?userId=loadtest";
const TOTAL_REQUESTS = 50;
const CONCURRENCY = 10;

let completed = 0;
let success = 0;
let blocked = 0;
let errors = 0;

function sendRequest() {
  return new Promise((resolve) => {
    const req = http.get(TARGET_URL, (res) => {
      if (res.statusCode === 200) success++;
      else if (res.statusCode === 429) blocked++;
      else errors++;

      res.resume();
      completed++;
      resolve();
    });

    req.on("error", (err) => {
      console.error("Request error:", err.message);
      errors++;
      completed++;
      resolve();
    });
  });
}

async function runLoadTest() {
  console.log("Starting load test...");
  const workers = [];

  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    workers.push(sendRequest());

    if (workers.length >= CONCURRENCY) {
      await Promise.all(workers);
      workers.length = 0;
    }
  }

  await Promise.all(workers);

  console.log("Load test completed");
  console.log({
    total: TOTAL_REQUESTS,
    success,
    blocked,
    errors
  });
}

runLoadTest();
