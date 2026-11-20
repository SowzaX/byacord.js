const { REST } = require("../rest/REST");
const { resolveMessagePayload } = require("../structures/MessagePayload");

class WebhookClient {
  constructor(data, options = {}) {
    let id = data.id;
    let token = data.token;

    if (data.url) {
      const match = /\/webhooks\/(\d+)\/([^/?]+)/.exec(data.url);
      if (!match) throw new Error("Invalid webhook URL.");
      id = match[1];
      token = match[2];
    }

    if (!id || !token) throw new Error("A webhook needs an id and a token (or a url).");

    this.id = id;
    this.token = token;
    this.options = { api: options.api || process.env.BYACORD_API || "https://client.bya.lat/api/v9", rest: { timeout: 15000, retries: 3, ...(options.rest || {}) } };

    const fake = { options: this.options, token: null, emit() {} };
    this.rest = new REST(fake);
  }

  _payload(options) {
    const { body, files } = resolveMessagePayload(options, null);
    const input = typeof options === "string" ? {} : options;

    if (input.username !== undefined) body.username = input.username;
    if (input.avatarURL !== undefined) body.avatar_url = input.avatarURL;
    if (input.threadName !== undefined) body.thread_name = input.threadName;

    return { body, files };
  }

  // Retorna o JSON cru da mensagem.
  send(options) {
    const { body, files } = this._payload(options);
    const query = { wait: "true" };

    if (options && options.threadId) query.thread_id = options.threadId;

    return this.rest.post(`/webhooks/${this.id}/${this.token}`, { body, files, query, auth: false });
  }

  editMessage(message, options) {
    const { body, files } = this._payload(options);
    return this.rest.patch(`/webhooks/${this.id}/${this.token}/messages/${message.id || message}`, { body, files, auth: false });
  }

  deleteMessage(message) {
    return this.rest.delete(`/webhooks/${this.id}/${this.token}/messages/${message.id || message}`, { auth: false });
  }

  fetchMessage(message) {
    return this.rest.get(`/webhooks/${this.id}/${this.token}/messages/${message.id || message}`, { auth: false });
  }

  destroy() {}
}

module.exports = WebhookClient;
