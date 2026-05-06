import http from "node:http";

const host = process.env.OPENAI_CODEX_BRIDGE_HOST || "127.0.0.1";
const port = Number(process.env.OPENAI_CODEX_BRIDGE_PORT || "1455");
const token = process.env.OPENAI_CODEX_BRIDGE_TOKEN || "dev-openai-codex-token";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function isAuthorized(req) {
  const header = req.headers.authorization || "";
  return header === `Bearer ${token}`;
}

function sendSse(res, text) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });

  const payload = {
    id: "chatcmpl-dev",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "gpt-5.2-codex",
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  };

  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  res.write(
    `data: ${JSON.stringify({
      id: "chatcmpl-dev",
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-5.2-codex",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    })}\n\n`
  );
  res.write("data: [DONE]\n\n");
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, provider: "openai-codex", mode: "dev-mock" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/oauth/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");

      if (!redirectUri || !state) {
        sendJson(res, 400, { error: { message: "Missing redirect_uri or state" } });
        return;
      }

      const callbackUrl = new URL(redirectUri);
      callbackUrl.searchParams.set("code", "dev-code");
      callbackUrl.searchParams.set("state", state);

      res.writeHead(302, { Location: callbackUrl.toString() });
      res.end();
      return;
    }

    if (req.method === "POST" && url.pathname === "/oauth/token") {
      await readBody(req);
      sendJson(res, 200, {
        access_token: token,
        refresh_token: "dev-refresh-token",
        expires_in: 3600,
        token_type: "Bearer",
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      if (!isAuthorized(req)) {
        sendJson(res, 401, { error: { message: "Missing or invalid local bridge token" } });
        return;
      }

      sendJson(res, 200, {
        object: "list",
        data: [
          { id: "gpt-5.2-codex", object: "model" },
          { id: "gpt-5.2-codex-max", object: "model" },
        ],
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      if (!isAuthorized(req)) {
        sendJson(res, 401, { error: { message: "Missing or invalid local bridge token" } });
        return;
      }

      const body = JSON.parse((await readBody(req)) || "{}");
      const text = "OpenAI Codex dev bridge is connected.";

      if (body.stream) {
        sendSse(res, text);
        return;
      }

      sendJson(res, 200, {
        id: "chatcmpl-dev",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model || "gpt-5.2-codex",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: text },
            finish_reason: "stop",
          },
        ],
      });
      return;
    }

    sendJson(res, 404, { error: { message: "Not found" } });
  } catch (error) {
    sendJson(res, 500, { error: { message: error instanceof Error ? error.message : String(error) } });
  }
});

server.listen(port, host, () => {
  console.log(`OpenAI Codex dev bridge listening at http://${host}:${port}`);
  console.log(`Use token: ${token}`);
  console.log("In ChatGPT MD settings, use 127.0.0.1 URLs unless openai-codex.local resolves locally.");
});
