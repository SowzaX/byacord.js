const EventEmitter = require("node:events");
const fs = require("node:fs/promises");
const { Readable } = require("node:stream");
const pkg = require("../../package.json");

const CONTENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  txt: "text/plain",
  json: "application/json",
  pdf: "application/pdf",
  csv: "text/csv",
};

class ByacordAPIError extends Error {
  constructor(status, method, route, body) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    super(`[${status}] ${method} ${route} -> ${detail}`.slice(0, 600));
    this.name = "ByacordAPIError";
    this.status = status;
    this.method = method;
    this.route = route;
    this.body = body;
    this.rawError = body;
    this.code = body && typeof body === "object" && body.code !== undefined ? body.code : status;
  }
}

class HTTPError extends Error {
  constructor(message, method, route) {
    super(message);
    this.name = "HTTPError";
    this.method = method;
    this.route = route;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bucketKey(method, route) {
  const parts = route.split("?")[0].split("/").filter(Boolean);

  if (parts[0] === "interactions") return `${method}:/interactions/callback`;
  if (parts[0] === "webhooks") return `${method}:/webhooks/${parts[1]}/:token/${parts.slice(3).map((part) => (/^\d{5,}$/.test(part) ? ":id" : part)).join("/")}`;

  const major = ["channels", "guilds"];
  const mapped = parts.map((part, index) => {
    if (!/^\d{5,}$/.test(part)) return part;
    if (major.includes(parts[index - 1])) return part;
    return ":id";
  });

  return `${method}:/${mapped.join("/")}`;
}

async function resolveFile(file) {
  const raw = file && file.attachment !== undefined ? file : { attachment: file };
  const source = raw.attachment;
  let data = null;

  if (Buffer.isBuffer(source)) data = source;
  if (source instanceof Uint8Array && !Buffer.isBuffer(source)) data = Buffer.from(source);
  if (source instanceof ArrayBuffer) data = Buffer.from(source);

  if (typeof source === "string" && /^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new HTTPError(`Could not download attachment (${res.status}): ${source}`, "GET", source);
    data = Buffer.from(await res.arrayBuffer());
  }

  if (typeof source === "string" && !/^https?:\/\//i.test(source)) data = await fs.readFile(source);

  if (source instanceof Readable) {
    const chunks = [];
    for await (const chunk of source) chunks.push(Buffer.from(chunk));
    data = Buffer.concat(chunks);
  }

  if (!data) throw new TypeError("Invalid attachment: use a Buffer, a file path, a URL or a Readable stream.");

  let name = raw.name;
  if (!name && typeof source === "string") name = source.split(/[\\/]/).pop().split("?")[0];
  if (!name) name = "file.bin";

  const extension = name.split(".").pop().toLowerCase();

  return {
    name,
    data,
    description: raw.description,
    contentType: raw.contentType || CONTENT_TYPES[extension] || "application/octet-stream",
  };
}

class REST extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.buckets = new Map();
    this.globalResetAt = 0;
  }

  get api() {
    return this.client.options.api;
  }

  async request(method, route, { body, query, files, reason, auth = true, attachmentsKey } = {}) {
    let url = `${this.api}${route}`;

    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
      }
      const text = params.toString();
      if (text) url += `?${text}`;
    }

    const headers = { "User-Agent": `byacord.js (${pkg.homepage}, ${pkg.version})` };
    if (auth && this.client.token) headers.Authorization = `Bot ${this.client.token}`;
    if (reason) headers["X-Audit-Log-Reason"] = encodeURIComponent(reason);

    let payload;

    if (files && files.length) {
      const resolved = await Promise.all(files.map(resolveFile));
      const form = new FormData();
      const json = { ...(body || {}) };
      if (attachmentsKey) json[attachmentsKey] = { ...(json[attachmentsKey] || {}) };
      const holder = attachmentsKey ? json[attachmentsKey] : json;
      const attachments = Array.isArray(holder.attachments) ? [...holder.attachments] : [];

      resolved.forEach((file, index) => {
        attachments.push({ id: index, filename: file.name, description: file.description });
        form.append(`files[${index}]`, new Blob([file.data], { type: file.contentType }), file.name);
      });

      holder.attachments = attachments;
      form.append("payload_json", JSON.stringify(json));
      payload = form;
    }

    if (!payload && body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const key = bucketKey(method, route);
    const retries = this.client.options.rest.retries;
    let networkFailures = 0;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const bucket = this.buckets.get(key);
      if (bucket && bucket.remaining <= 0 && bucket.resetAt > Date.now()) await sleep(bucket.resetAt - Date.now());
      if (this.globalResetAt > Date.now()) await sleep(this.globalResetAt - Date.now());

      let res;

      try {
        res = await fetch(url, {
          method,
          headers,
          body: payload,
          signal: AbortSignal.timeout(this.client.options.rest.timeout),
        });
      } catch (err) {
        networkFailures++;
        if (networkFailures > 2) throw new HTTPError(`Request failed: ${err.message}`, method, route);
        await sleep(1000 * networkFailures);
        attempt--;
        continue;
      }

      const text = await res.text();
      let data = null;

      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (process.env.BYACORD_DEBUG === "1") console.log(`[byacord:rest] ${method} ${route} -> ${res.status} ${text.slice(0, 200)}`);

      const remaining = res.headers.get("x-ratelimit-remaining");
      const resetAfter = res.headers.get("x-ratelimit-reset-after");

      if (remaining !== null && resetAfter !== null) {
        this.buckets.set(key, { remaining: Number(remaining), resetAt: Date.now() + Number(resetAfter) * 1000 });

        if (this.buckets.size > 500) {
          const now = Date.now();
          for (const [bucketId, info] of this.buckets) {
            if (info.resetAt < now) this.buckets.delete(bucketId);
          }
        }
      }

      this.emit("response", { method, route, status: res.status });

      if (res.status === 429 && attempt < retries) {
        const waitSeconds = (data && typeof data === "object" && data.retry_after) || Number(res.headers.get("retry-after")) || 1;
        const isGlobal = Boolean(data && typeof data === "object" && data.global);

        if (isGlobal) this.globalResetAt = Date.now() + waitSeconds * 1000;
        this.emit("rateLimited", { method, route, timeToReset: waitSeconds * 1000, global: isGlobal });
        this.client.emit("rateLimited", { method, route, timeToReset: waitSeconds * 1000, global: isGlobal });

        await sleep(waitSeconds * 1000);
        continue;
      }

      if ([502, 503, 504].includes(res.status) && attempt < retries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      if (!res.ok) throw new ByacordAPIError(res.status, method, route, data);

      return data;
    }

    throw new HTTPError("Maximum retries exceeded.", method, route);
  }

  get(route, options) {
    return this.request("GET", route, options);
  }

  post(route, options) {
    return this.request("POST", route, options);
  }

  patch(route, options) {
    return this.request("PATCH", route, options);
  }

  put(route, options) {
    return this.request("PUT", route, options);
  }

  delete(route, options) {
    return this.request("DELETE", route, options);
  }
}

module.exports = { REST, ByacordAPIError, HTTPError, resolveFile };
