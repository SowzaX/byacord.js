const EventEmitter = require("node:events");
const WebSocket = require("ws");
const { REST } = require("../rest/REST");
const Collection = require("../util/Collection");
const { IntentsBitField } = require("../util/BitField");
const { Events } = require("../util/constants");
const managers = require("../managers");
const S = require("../structures");

const FATAL_CLOSE_CODES = {
  4004: "An invalid token was provided.",
  4010: "Invalid shard.",
  4011: "Sharding required.",
  4012: "Invalid API version.",
  4013: "Invalid intents were provided.",
  4014: "Used disallowed intents.",
};

class Client extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      api: options.api || process.env.BYACORD_API || "https://client.bya.lat/api/v9",
      gateway: options.gateway || process.env.BYACORD_GATEWAY || null,
      cdn: options.cdn || "https://client.bya.lat",
      web: options.web || "https://client.bya.lat",
      intents: options.intents === undefined ? 0 : options.intents,
      partials: options.partials || [],
      presence: options.presence || null,
      allowedMentions: options.allowedMentions || null,
      messageCacheMaxSize: options.messageCacheMaxSize === undefined ? 100 : options.messageCacheMaxSize,
      waitGuildTimeout: options.waitGuildTimeout === undefined ? 5000 : options.waitGuildTimeout,
      rest: { timeout: 15000, retries: 3, ...(options.rest || {}) },
    };

    this.rest = new REST(this);
    this.token = null;
    this.user = null;
    this.application = null;
    this.readyAt = null;
    this.presence = null;
    this.ws = { ping: -1, status: "idle", socket: null };

    this.users = new managers.UserManager(this);
    this.guilds = new managers.GuildManager(this);
    this.channels = new managers.ChannelManager(this);

    this.sessionId = null;
    this.resumeUrl = null;
    this.seq = null;
    this._pending = new Set();
    this._destroyed = false;
    this._attempts = 0;
  }

  get readyTimestamp() {
    return this.readyAt;
  }

  get uptime() {
    return this.readyAt ? Date.now() - this.readyAt : null;
  }

  isReady() {
    return this.readyAt !== null;
  }

  _debug(...args) {
    this.emit(Events.Debug, args.join(" "));
    if (process.env.BYACORD_DEBUG === "1") console.log("[byacord:gateway]", ...args);
  }

  _fail(err) {
    if (this.listenerCount(Events.Error) > 0) return this.emit(Events.Error, err);
    return console.error("[byacord]", err);
  }

  _upsertUser(raw) {
    if (!raw) return null;

    const cached = this.users.cache.get(raw.id);

    if (cached) {
      cached._patch(raw);
      return cached;
    }

    const user = new S.User(this, raw);
    this.users.cache.set(user.id, user);
    return user;
  }

  _channelFor(channelId, guildId) {
    const cached = this.channels.cache.get(channelId);
    if (cached) return cached;

    const stub = S.createChannel(this, { id: channelId, type: guildId ? 0 : 1, guild_id: guildId });
    this.channels.cache.set(stub.id, stub);
    return stub;
  }

  _partialMessage(id, channelId, guildId) {
    return new S.Message(this, { id, channel_id: channelId, guild_id: guildId });
  }

  async fetchApplication() {
    return this.application ? this.application.fetch() : null;
  }

  async login(token) {
    this.token = token || this.token;
    if (!this.token) throw new Error("An invalid token was provided.");

    let url = this.options.gateway;
    let lastError = null;

    if (!url) {
      for (const route of ["/gateway/bot", "/gateway"]) {
        try {
          const info = await this.rest.get(route);

          if (info && info.url) {
            url = info.url;
            break;
          }
        } catch (err) {
          if (err.status === 401) throw new Error("An invalid token was provided.");
          lastError = err;
        }
      }
    }

    if (!url) throw lastError || new Error("Gateway URL not found.");

    this._gatewayUrl = url;
    this._destroyed = false;

    await new Promise((resolve, reject) => {
      this._login = { resolve, reject };
      this._connect();
    });

    return this.token;
  }

  destroy() {
    this._destroyed = true;
    clearTimeout(this._firstBeat);
    clearInterval(this._heartbeat);
    clearTimeout(this._readyTimer);
    clearTimeout(this._reconnectTimer);
    this.ws.status = "disconnected";
    if (this.ws.socket) this.ws.socket.close(1000, "destroy");
    this.readyAt = null;
  }

  _connect() {
    const base = this.sessionId && this.resumeUrl ? this.resumeUrl : this._gatewayUrl;
    const url = `${base}${base.includes("?") ? "&" : "?"}v=9&encoding=json`;
    const socket = new WebSocket(url);

    this.ws.socket = socket;
    this.ws.status = "connecting";
    this._ack = true;
    this._debug("connecting to", url);

    socket.on("message", (raw) => {
      if (socket !== this.ws.socket) return;

      let payload = null;

      try {
        payload = JSON.parse(raw.toString());
      } catch {
        return;
      }

      this._onPayload(payload);
    });

    socket.on("error", (err) => this.emit(Events.Warn, `Socket error: ${err.message}`));
    socket.on("close", (code) => this._onClose(code, socket));
  }

  _send(payload) {
    const socket = this.ws.socket;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  _beat() {
    if (!this._ack) {
      this._debug("no heartbeat ACK, reconnecting");
      this.ws.socket.terminate();
      return;
    }

    this._ack = false;
    this._lastBeat = Date.now();
    this._send({ op: 1, d: this.seq });
  }

  _identify() {
    this._send({
      op: 2,
      d: {
        token: this.token,
        intents: Number(new IntentsBitField(this.options.intents).bitfield),
        properties: { os: process.platform, browser: "byacord.js", device: "byacord.js" },
        presence: this.presence || this.options.presence || { status: "online", activities: [], afk: false, since: null },
      },
    });
  }

  _setPresence(data = {}) {
    this.presence = {
      since: null,
      activities: (data.activities || []).map((activity) => ({ name: activity.name, type: activity.type || 0, state: activity.state, url: activity.url })),
      status: data.status || (this.presence && this.presence.status) || "online",
      afk: Boolean(data.afk),
    };

    this._send({ op: 3, d: this.presence });
  }

  _onPayload(payload) {
    if (payload.s !== null && payload.s !== undefined) this.seq = payload.s;

    this._debug("<-", payload.op, payload.t || "");

    if (payload.op === 10) {
      const interval = payload.d.heartbeat_interval;
      this._ack = true;

      this._firstBeat = setTimeout(() => {
        this._beat();
        this._heartbeat = setInterval(() => this._beat(), interval);
      }, interval * Math.random());

      if (this.sessionId && this.seq !== null) this._send({ op: 6, d: { token: this.token, session_id: this.sessionId, seq: this.seq } });
      if (!this.sessionId || this.seq === null) this._identify();
    }

    if (payload.op === 11) {
      this._ack = true;
      if (this._lastBeat) this.ws.ping = Date.now() - this._lastBeat;
    }

    if (payload.op === 1) this._send({ op: 1, d: this.seq });
    if (payload.op === 7) this.ws.socket.close(4000, "reconnect");

    if (payload.op === 9) {
      if (!payload.d) {
        this.sessionId = null;
        this.resumeUrl = null;
        this.seq = null;
      }

      this.ws.socket.close(4000, "invalid session");
    }

    if (payload.op === 0) this._dispatch(payload.t, payload.d);
  }

  _onClose(code, socket) {
    if (socket !== this.ws.socket) return;

    clearTimeout(this._firstBeat);
    clearInterval(this._heartbeat);
    this.ws.status = "disconnected";

    if (this._destroyed) return;

    if (FATAL_CLOSE_CODES[code]) {
      const error = new Error(FATAL_CLOSE_CODES[code]);

      if (this._login) {
        this._login.reject(error);
        this._login = null;
        return;
      }

      this._fail(error);
      return;
    }

    if (code === 4007 || code === 4009 || code === 1000) {
      this.sessionId = null;
      this.resumeUrl = null;
      this.seq = null;
    }

    this._attempts++;
    const delay = Math.min(3000 * 2 ** (this._attempts - 1), 30000);

    this.emit(Events.Warn, `Connection closed (${code}), reconnecting in ${delay / 1000}s...`);
    this._reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  _finishReady() {
    if (this.readyAt) return;

    clearTimeout(this._readyTimer);
    this.readyAt = Date.now();
    this.ws.status = "ready";

    if (this._login) {
      this._login.resolve();
      this._login = null;
    }

    this.emit(Events.ClientReady, this);
    this.emit(Events.Ready, this);
  }

  _dispatch(t, d) {
    this.emit(Events.Raw, { t, d });

    try {
      this._handle(t, d);
    } catch (err) {
      this._fail(err);
    }
  }

  _handle(t, d) {
    if (t === "READY") {
      this._attempts = 0;
      this.sessionId = d.session_id;
      this.resumeUrl = d.resume_gateway_url || null;
      this.user = new S.ClientUser(this, d.user);
      this.users.cache.set(this.user.id, this.user);
      this.application = new S.ClientApplication(this, { ...(d.application || {}), id: (d.application && d.application.id) || d.user.id });
      this._pending = new Set();

      for (const guild of d.guilds || []) {
        if (guild.unavailable === false || guild.name) this.guilds.cache.set(guild.id, new S.Guild(this, guild));
        if (guild.unavailable !== false && !guild.name) this._pending.add(guild.id);
      }

      if (!this._pending.size) this._finishReady();
      if (this._pending.size) this._readyTimer = setTimeout(() => this._finishReady(), this.options.waitGuildTimeout);
    }

    if (t === "RESUMED") {
      this._attempts = 0;
      this.emit(Events.Resumed);
    }

    if (t === "GUILD_CREATE") {
      const initial = this._pending.has(d.id);
      const existing = this.guilds.cache.get(d.id);
      const guild = existing || new S.Guild(this, d);

      if (existing) existing._patch(d);
      this.guilds.cache.set(guild.id, guild);

      if (initial) {
        this._pending.delete(guild.id);
        if (!this._pending.size) this._finishReady();
      }

      if (!initial && !existing) this.emit(Events.GuildCreate, guild);
    }

    if (t === "GUILD_UPDATE") {
      const guild = this.guilds.cache.get(d.id);

      if (guild) {
        const old = Object.assign(Object.create(Object.getPrototypeOf(guild)), guild);
        guild._patch(d);
        this.emit(Events.GuildUpdate, old, guild);
      }
    }

    if (t === "GUILD_DELETE") {
      const guild = this.guilds.cache.get(d.id);
      this.guilds.cache.delete(d.id);
      if (guild && !d.unavailable) this.emit(Events.GuildDelete, guild);
    }

    if (t === "CHANNEL_CREATE" || t === "THREAD_CREATE") {
      const guild = d.guild_id ? this.guilds.cache.get(d.guild_id) : null;
      const channel = guild ? guild.channels._add(d) : S.createChannel(this, d);

      if (!guild) this.channels.cache.set(channel.id, channel);
      if (t === "CHANNEL_CREATE") this.emit(Events.ChannelCreate, channel);
      if (t === "THREAD_CREATE") this.emit(Events.ThreadCreate, channel, !d.newly_created ? false : true);
    }

    if (t === "CHANNEL_UPDATE" || t === "THREAD_UPDATE") {
      const guild = d.guild_id ? this.guilds.cache.get(d.guild_id) : null;
      const old = this.channels.cache.get(d.id);
      const clone = old ? Object.assign(Object.create(Object.getPrototypeOf(old)), old) : null;
      const channel = guild ? guild.channels._add(d) : old;

      if (channel) this.emit(t === "CHANNEL_UPDATE" ? Events.ChannelUpdate : Events.ThreadUpdate, clone, channel);
    }

    if (t === "CHANNEL_DELETE" || t === "THREAD_DELETE") {
      const channel = this.channels.cache.get(d.id) || S.createChannel(this, d);
      const guild = d.guild_id ? this.guilds.cache.get(d.guild_id) : null;

      this.channels.cache.delete(d.id);
      if (guild) guild.channels.cache.delete(d.id);

      this.emit(t === "CHANNEL_DELETE" ? Events.ChannelDelete : Events.ThreadDelete, channel);
    }

    if (t === "GUILD_ROLE_CREATE") {
      const guild = this.guilds.cache.get(d.guild_id);
      if (guild) this.emit(Events.GuildRoleCreate, guild.roles._add(d.role));
    }

    if (t === "GUILD_ROLE_UPDATE") {
      const guild = this.guilds.cache.get(d.guild_id);
      const old = guild ? guild.roles.cache.get(d.role.id) : null;

      if (guild) {
        const clone = old ? Object.assign(Object.create(Object.getPrototypeOf(old)), old) : null;
        this.emit(Events.GuildRoleUpdate, clone, guild.roles._add(d.role));
      }
    }

    if (t === "GUILD_ROLE_DELETE") {
      const guild = this.guilds.cache.get(d.guild_id);
      const role = guild ? guild.roles.cache.get(d.role_id) : null;

      if (guild) guild.roles.cache.delete(d.role_id);
      if (role) this.emit(Events.GuildRoleDelete, role);
    }

    if (t === "GUILD_MEMBER_ADD") {
      const guild = this.guilds.cache.get(d.guild_id);

      if (guild) {
        const member = guild.members._add(d);
        if (guild.memberCount !== undefined) guild.memberCount++;
        this.emit(Events.GuildMemberAdd, member);
      }
    }

    if (t === "GUILD_MEMBER_UPDATE") {
      const guild = this.guilds.cache.get(d.guild_id);

      if (guild) {
        const old = guild.members.cache.get(d.user.id);
        const clone = old ? old._clone() : null;
        this.emit(Events.GuildMemberUpdate, clone, guild.members._add(d));
      }
    }

    if (t === "GUILD_MEMBER_REMOVE") {
      const guild = this.guilds.cache.get(d.guild_id);

      if (guild) {
        const member = guild.members.cache.get(d.user.id) || new S.GuildMember(this, guild.id, { user: d.user });
        guild.members.cache.delete(d.user.id);
        if (guild.memberCount !== undefined) guild.memberCount--;
        this.emit(Events.GuildMemberRemove, member);
      }
    }

    if (t === "GUILD_BAN_ADD" || t === "GUILD_BAN_REMOVE") {
      const guild = this.guilds.cache.get(d.guild_id);
      const ban = { guild, user: this._upsertUser(d.user), reason: null };
      this.emit(t === "GUILD_BAN_ADD" ? Events.GuildBanAdd : Events.GuildBanRemove, ban);
    }

    if (t === "MESSAGE_CREATE") {
      const channel = this._channelFor(d.channel_id, d.guild_id);
      const message = channel.messages ? channel.messages._add(d) : new S.Message(this, d);

      if (channel.lastMessageId !== undefined) channel.lastMessageId = message.id;
      this.emit(Events.MessageCreate, message);
    }

    if (t === "MESSAGE_UPDATE") {
      const channel = this._channelFor(d.channel_id, d.guild_id);
      const cached = channel.messages ? channel.messages.cache.get(d.id) : null;
      const old = cached ? Object.assign(Object.create(Object.getPrototypeOf(cached)), cached) : this._partialMessage(d.id, d.channel_id, d.guild_id);
      const message = channel.messages ? channel.messages._add(d) : new S.Message(this, d);

      this.emit(Events.MessageUpdate, old, message);
    }

    if (t === "MESSAGE_DELETE") {
      const channel = this._channelFor(d.channel_id, d.guild_id);
      const cached = channel.messages ? channel.messages.cache.get(d.id) : null;
      const message = cached || this._partialMessage(d.id, d.channel_id, d.guild_id);

      if (channel.messages) channel.messages.cache.delete(d.id);
      this.emit(Events.MessageDelete, message);
    }

    if (t === "MESSAGE_DELETE_BULK") {
      const channel = this._channelFor(d.channel_id, d.guild_id);
      const messages = new Collection();

      for (const id of d.ids) {
        const cached = channel.messages ? channel.messages.cache.get(id) : null;
        messages.set(id, cached || this._partialMessage(id, d.channel_id, d.guild_id));
        if (channel.messages) channel.messages.cache.delete(id);
      }

      this.emit(Events.MessageBulkDelete, messages, channel);
    }

    if (t === "MESSAGE_REACTION_ADD" || t === "MESSAGE_REACTION_REMOVE") {
      const channel = this._channelFor(d.channel_id, d.guild_id);
      const message = (channel.messages && channel.messages.cache.get(d.message_id)) || this._partialMessage(d.message_id, d.channel_id, d.guild_id);
      const user = (d.member && d.member.user && this._upsertUser(d.member.user)) || this.users.cache.get(d.user_id) || new S.User(this, { id: d.user_id });
      const reaction = new S.MessageReaction(this, { emoji: d.emoji, me: this.user && d.user_id === this.user.id }, message);

      this.emit(t === "MESSAGE_REACTION_ADD" ? Events.MessageReactionAdd : Events.MessageReactionRemove, reaction, user);
    }

    if (t === "INTERACTION_CREATE") this.emit(Events.InteractionCreate, S.createInteraction(this, d));

    if (t === "VOICE_STATE_UPDATE") {
      const guild = d.guild_id ? this.guilds.cache.get(d.guild_id) : null;

      if (guild) {
        const old = guild.voiceStates.cache.get(d.user_id) || new S.VoiceState(this, guild.id, { user_id: d.user_id });
        const state = new S.VoiceState(this, guild.id, d);

        if (state.channelId) guild.voiceStates.cache.set(d.user_id, state);
        if (!state.channelId) guild.voiceStates.cache.delete(d.user_id);

        this.emit(Events.VoiceStateUpdate, old, state);
      }
    }

    if (t === "PRESENCE_UPDATE") {
      const guild = d.guild_id ? this.guilds.cache.get(d.guild_id) : null;
      const presence = new S.Presence(this, d);
      const old = guild ? guild.presences.cache.get(d.user.id) || null : null;

      if (guild) guild.presences.cache.set(d.user.id, presence);
      this.emit(Events.PresenceUpdate, old, presence);
    }

    if (t === "TYPING_START") {
      const channel = this._channelFor(d.channel_id, d.guild_id);
      const user = this.users.cache.get(d.user_id) || new S.User(this, { id: d.user_id });
      this.emit(Events.TypingStart, { channel, user, startedTimestamp: d.timestamp * 1000 });
    }
  }
}

module.exports = Client;
