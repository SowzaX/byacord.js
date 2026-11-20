const EventEmitter = require("node:events");
const Collection = require("../util/Collection");

class Collector extends EventEmitter {
  constructor(client, options = {}) {
    super();
    this.client = client;
    this.options = options;
    this.filter = options.filter || (() => true);
    this.collected = new Collection();
    this.ended = false;
    this.endReason = null;
    this.lastCollectedTimestamp = null;
    this._timeout = null;
    this._idleTimeout = null;

    if (typeof this.filter !== "function") throw new TypeError("The filter must be a function.");

    this.handleCollect = this.handleCollect.bind(this);
    this.handleDispose = this.handleDispose.bind(this);

    if (options.time) this._timeout = setTimeout(() => this.stop("time"), options.time);
    if (options.idle) this._idleTimeout = setTimeout(() => this.stop("idle"), options.idle);
  }

  get lastCollectedAt() {
    return this.lastCollectedTimestamp ? new Date(this.lastCollectedTimestamp) : null;
  }

  async handleCollect(...args) {
    if (this.ended) return;

    const key = this.collect(...args);
    if (key === null || key === undefined) return;

    const accepted = await this.filter(...args, this.collected);

    if (accepted) {
      this.collected.set(key, args[0]);
      this.lastCollectedTimestamp = Date.now();
      this.emit("collect", ...args);

      if (this._idleTimeout) {
        clearTimeout(this._idleTimeout);
        this._idleTimeout = setTimeout(() => this.stop("idle"), this.options.idle);
      }
    }

    if (!accepted) this.emit("ignore", ...args);

    const reason = this.checkEnd();
    if (reason) this.stop(reason);
  }

  handleDispose(...args) {
    const key = this.dispose(...args);
    if (key === null || key === undefined) return;
    if (this.collected.delete(key)) this.emit("dispose", ...args);
  }

  resetTimer({ time, idle } = {}) {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = setTimeout(() => this.stop("time"), time || this.options.time);
    }

    if (this._idleTimeout) {
      clearTimeout(this._idleTimeout);
      this._idleTimeout = setTimeout(() => this.stop("idle"), idle || this.options.idle);
    }
  }

  stop(reason = "user") {
    if (this.ended) return;

    clearTimeout(this._timeout);
    clearTimeout(this._idleTimeout);
    this.ended = true;
    this.endReason = reason;
    this.removeListeners();
    this.emit("end", this.collected, reason);
  }

  collect() {
    return null;
  }

  dispose() {
    return null;
  }

  checkEnd() {
    return null;
  }

  removeListeners() {}
}

class InteractionCollector extends Collector {
  constructor(client, options = {}) {
    super(client, options);

    this.messageId = options.message ? options.message.id : options.messageId || null;
    this.channelId = options.channel ? options.channel.id : options.channelId || null;
    this.guildId = options.guild ? options.guild.id : options.guildId || null;
    this.interactionType = options.interactionType || null;
    this.componentType = options.componentType || null;
    this.users = new Collection();
    this.total = 0;

    client.on("interactionCreate", this.handleCollect);
    client.on("messageDelete", this._onMessageDelete = (message) => {
      if (this.messageId && message.id === this.messageId) this.stop("messageDelete");
    });
    client.on("channelDelete", this._onChannelDelete = (channel) => {
      if (this.channelId && channel.id === this.channelId) this.stop("channelDelete");
    });
    client.on("guildDelete", this._onGuildDelete = (guild) => {
      if (this.guildId && guild.id === this.guildId) this.stop("guildDelete");
    });
  }

  collect(interaction) {
    if (this.interactionType && interaction.type !== this.interactionType) return null;
    if (this.componentType && interaction.componentType !== this.componentType) return null;
    if (this.messageId && (!interaction.message || interaction.message.id !== this.messageId)) return null;

    if (this.options.interactionResponse) {
      const originalId = this.options.interactionResponse.interaction.id;
      const message = interaction.message;
      const matches = message && ((message.interactionMetadata && message.interactionMetadata.id === originalId) || (message.interaction && message.interaction.id === originalId));
      if (!matches) return null;
    }

    if (this.channelId && interaction.channelId !== this.channelId) return null;
    if (this.guildId && interaction.guildId !== this.guildId) return null;

    return interaction.id;
  }

  async handleCollect(interaction) {
    const before = this.collected.size;
    await super.handleCollect(interaction);

    if (this.collected.size > before) {
      this.total++;
      if (interaction.user) this.users.set(interaction.user.id, interaction.user);
    }
  }

  checkEnd() {
    if (this.options.max && this.collected.size >= this.options.max) return "limit";
    if (this.options.maxComponents && this.total >= this.options.maxComponents) return "componentLimit";
    if (this.options.maxUsers && this.users.size >= this.options.maxUsers) return "userLimit";
    return null;
  }

  removeListeners() {
    this.client.off("interactionCreate", this.handleCollect);
    this.client.off("messageDelete", this._onMessageDelete);
    this.client.off("channelDelete", this._onChannelDelete);
    this.client.off("guildDelete", this._onGuildDelete);
  }
}

class MessageCollector extends Collector {
  constructor(channel, options = {}) {
    super(channel.client, options);
    this.channel = channel;
    this.received = 0;

    this.client.on("messageCreate", this.handleCollect);
    this.client.on("messageDelete", this.handleDispose);
    this.client.on("channelDelete", this._onChannelDelete = (deleted) => {
      if (deleted.id === this.channel.id) this.stop("channelDelete");
    });
    this.client.on("guildDelete", this._onGuildDelete = (guild) => {
      if (this.channel.guildId && guild.id === this.channel.guildId) this.stop("guildDelete");
    });
  }

  collect(message) {
    if (message.channelId !== this.channel.id) return null;
    this.received++;
    return message.id;
  }

  dispose(message) {
    return message.channelId === this.channel.id ? message.id : null;
  }

  checkEnd() {
    if (this.options.max && this.collected.size >= this.options.max) return "limit";
    if (this.options.maxProcessed && this.received === this.options.maxProcessed) return "processedLimit";
    return null;
  }

  removeListeners() {
    this.client.off("messageCreate", this.handleCollect);
    this.client.off("messageDelete", this.handleDispose);
    this.client.off("channelDelete", this._onChannelDelete);
    this.client.off("guildDelete", this._onGuildDelete);
  }
}

function awaitFirst(collector) {
  return new Promise((resolve, reject) => {
    collector.once("end", (collected, reason) => {
      const first = collected.first();
      if (first) return resolve(first);
      return reject(new Error(`Collector received no interactions before ending with reason: ${reason}`));
    });
  });
}

module.exports = { Collector, InteractionCollector, MessageCollector, awaitFirst };
