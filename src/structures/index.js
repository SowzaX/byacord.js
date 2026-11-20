const Collection = require("../util/Collection");
const { PermissionsBitField, MessageFlagsBitField } = require("../util/BitField");
const { ChannelType, MessageFlags } = require("../util/constants");
const { SnowflakeUtil } = require("../util/Util");
const { resolveMessagePayload, toRaw } = require("./MessagePayload");
const { InteractionCollector, MessageCollector, awaitFirst } = require("./Collectors");
const managers = require("../managers");

function imageURL(client, path, hash, { size = 1024, extension, forceStatic = false } = {}) {
  if (String(hash).startsWith("http")) return hash;

  const animated = String(hash).startsWith("a_");
  const ext = extension || (animated && !forceStatic ? "gif" : "png");

  return `${client.options.cdn}/${path}/${hash}.${ext}?size=${size}`;
}

async function toDataURI(client, input) {
  if (typeof input === "string" && input.startsWith("data:")) return input;

  const { resolveFile } = require("../rest/REST");
  const file = await resolveFile(input);

  return `data:${file.contentType};base64,${file.data.toString("base64")}`;
}

/* ---------------------------------- Usuarios ---------------------------------- */

class User {
  constructor(client, data) {
    this.client = client;
    this.id = data.id;
    this.bot = false;
    this.system = false;
    this._patch(data);
  }

  _patch(data) {
    if (data.username !== undefined) this.username = data.username;
    if (data.global_name !== undefined) this.globalName = data.global_name;
    if (data.discriminator !== undefined) this.discriminator = data.discriminator;
    if (data.avatar !== undefined) this.avatar = data.avatar;
    if (data.banner !== undefined) this.banner = data.banner;
    if (data.accent_color !== undefined) this.accentColor = data.accent_color;
    if (data.bot !== undefined) this.bot = Boolean(data.bot);
    if (data.system !== undefined) this.system = Boolean(data.system);
    if (data.public_flags !== undefined) this.flags = data.public_flags;
  }

  get partial() {
    return typeof this.username !== "string";
  }

  get createdTimestamp() {
    return SnowflakeUtil.timestampFrom(this.id);
  }

  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  get tag() {
    if (this.partial) return null;
    return this.discriminator && this.discriminator !== "0" ? `${this.username}#${this.discriminator}` : this.username;
  }

  get displayName() {
    return this.globalName || this.username;
  }

  get defaultAvatarURL() {
    return `${this.client.options.cdn}/embed/avatars/${(/^\d+$/.test(this.id) ? Number(BigInt(this.id) >> 22n) % 6 : 0)}.png`;
  }

  get dmChannel() {
    return this.client.channels.cache.find((channel) => channel.isDMBased() && channel.recipientId === this.id) || null;
  }

  // TODO: confirmar o CDN de avatares da Byacord (new Client({ cdn }))
  avatarURL(options) {
    return this.avatar ? imageURL(this.client, `avatars/${this.id}`, this.avatar, options) : null;
  }

  displayAvatarURL(options) {
    return this.avatarURL(options) || this.defaultAvatarURL;
  }

  bannerURL(options) {
    return this.banner ? imageURL(this.client, `banners/${this.id}`, this.banner, options) : null;
  }

  async fetch(force = true) {
    return this.client.users.fetch(this.id, { force });
  }

  createDM() {
    return this.client.users.createDM(this);
  }

  async send(options) {
    const dm = await this.createDM();
    return dm.send(options);
  }

  equals(user) {
    return Boolean(user) && this.id === user.id;
  }

  toString() {
    return `<@${this.id}>`;
  }

  toJSON() {
    return { id: this.id, username: this.username, globalName: this.globalName, discriminator: this.discriminator, avatar: this.avatar, bot: this.bot };
  }
}

class ClientUser extends User {
  setPresence(data) {
    this.client._setPresence(data);
    return this.client.presence;
  }

  setActivity(name, options = {}) {
    if (name && typeof name === "object") return this.setPresence({ activities: [name] });
    return this.setPresence({ activities: [{ name, type: options.type || 0, url: options.url, state: options.state }] });
  }

  setStatus(status) {
    return this.setPresence({ status });
  }

  setAFK(afk = true) {
    return this.setPresence({ afk });
  }

  async setUsername(username) {
    const data = await this.client.rest.patch("/users/@me", { body: { username } });
    this._patch(data);
    return this;
  }

  async setAvatar(avatar) {
    const data = await this.client.rest.patch("/users/@me", { body: { avatar: avatar === null ? null : await toDataURI(this.client, avatar) } });
    this._patch(data);
    return this;
  }

  async setBanner(banner) {
    const data = await this.client.rest.patch("/users/@me", { body: { banner: banner === null ? null : await toDataURI(this.client, banner) } });
    this._patch(data);
    return this;
  }
}

class GuildMember {
  constructor(client, guildId, data) {
    this.client = client;
    this.guildId = guildId;
    this._roleIds = [];
    this._permissions = null;
    this.user = null;
    this.id = null;
    this.roles = new managers.GuildMemberRoleManager(this);
    this._patch(data);
  }

  _patch(data) {
    if (data.user) {
      this.user = this.client._upsertUser(data.user);
      this.id = this.user.id;
    }

    if (data.id !== undefined && !this.id) this.id = data.id;
    if (data.nick !== undefined) this.nickname = data.nick;
    if (data.roles !== undefined) this._roleIds = [...data.roles];
    if (data.joined_at !== undefined) this.joinedTimestamp = data.joined_at ? Date.parse(data.joined_at) : null;
    if (data.premium_since !== undefined) this.premiumSinceTimestamp = data.premium_since ? Date.parse(data.premium_since) : null;
    if (data.pending !== undefined) this.pending = data.pending;
    if (data.flags !== undefined) this.flags = data.flags;
    if (data.avatar !== undefined) this.avatar = data.avatar;
    if (data.communication_disabled_until !== undefined) this.communicationDisabledUntilTimestamp = data.communication_disabled_until ? Date.parse(data.communication_disabled_until) : null;
    if (data.permissions !== undefined) this._permissions = new PermissionsBitField(data.permissions);

    if (this.nickname === undefined) this.nickname = null;
  }

  _clone() {
    const clone = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);
    clone._roleIds = [...this._roleIds];
    clone.roles = new managers.GuildMemberRoleManager(clone);
    return clone;
  }

  get guild() {
    return this.client.guilds.cache.get(this.guildId) || null;
  }

  get partial() {
    return this.joinedTimestamp === undefined;
  }

  get joinedAt() {
    return this.joinedTimestamp ? new Date(this.joinedTimestamp) : null;
  }

  get communicationDisabledUntil() {
    return this.communicationDisabledUntilTimestamp ? new Date(this.communicationDisabledUntilTimestamp) : null;
  }

  get displayName() {
    return this.nickname || (this.user && this.user.displayName) || null;
  }

  get permissions() {
    if (this._permissions) return this._permissions;

    const guild = this.guild;
    if (!guild) return new PermissionsBitField();
    if (guild.ownerId === this.id) return new PermissionsBitField(PermissionsBitField.All);

    const everyone = guild.roles.cache.get(guild.id);
    let bits = everyone ? everyone.permissions.bitfield : 0n;

    for (const roleId of this._roleIds) {
      const role = guild.roles.cache.get(roleId);
      if (role) bits |= role.permissions.bitfield;
    }

    if ((bits & PermissionsBitField.Flags.Administrator) === PermissionsBitField.Flags.Administrator) return new PermissionsBitField(PermissionsBitField.All);
    return new PermissionsBitField(bits);
  }

  displayAvatarURL(options) {
    return this.user.displayAvatarURL(options);
  }

  avatarURL(options) {
    return this.user.avatarURL(options);
  }

  isCommunicationDisabled() {
    return Boolean(this.communicationDisabledUntilTimestamp) && this.communicationDisabledUntilTimestamp > Date.now();
  }

  fetch(force = true) {
    return this.guild.members.fetch({ user: this.id, force });
  }

  edit(options) {
    return this.guild.members.edit(this, options);
  }

  setNickname(nickname, reason) {
    return this.edit({ nick: nickname, reason });
  }

  timeout(ms, reason) {
    return this.edit({ communicationDisabledUntil: ms === null ? null : Date.now() + ms, reason });
  }

  disableCommunicationUntil(date, reason) {
    return this.edit({ communicationDisabledUntil: date, reason });
  }

  async kick(reason) {
    await this.guild.members.kick(this, reason);
    return this;
  }

  async ban(options) {
    await this.guild.members.ban(this, options);
    return this;
  }

  send(options) {
    return this.user.send(options);
  }

  toString() {
    return `<@${this.id}>`;
  }
}

class Role {
  constructor(client, data, guild) {
    this.client = client;
    this.id = data.id;
    this.guildId = guild ? guild.id : data.guild_id || null;
    this._patch(data);
  }

  _patch(data) {
    if (data.name !== undefined) this.name = data.name;
    if (data.color !== undefined) this.color = data.color;
    if (data.hoist !== undefined) this.hoist = data.hoist;
    if (data.position !== undefined) this.position = data.position;
    if (data.permissions !== undefined) this.permissions = new PermissionsBitField(data.permissions);
    if (data.managed !== undefined) this.managed = data.managed;
    if (data.mentionable !== undefined) this.mentionable = data.mentionable;
    if (data.icon !== undefined) this.icon = data.icon;
    if (data.unicode_emoji !== undefined) this.unicodeEmoji = data.unicode_emoji;
    if (data.tags !== undefined) this.tags = data.tags;
    if (!this.permissions) this.permissions = new PermissionsBitField();
  }

  get guild() {
    return this.client.guilds.cache.get(this.guildId) || null;
  }

  get hexColor() {
    return `#${this.color.toString(16).padStart(6, "0")}`;
  }

  get members() {
    const guild = this.guild;
    if (!guild) return new Collection();
    return guild.members.cache.filter((member) => this.id === guild.id || member._roleIds.includes(this.id));
  }

  get createdTimestamp() {
    return SnowflakeUtil.timestampFrom(this.id);
  }

  comparePositionTo(role) {
    return this.position - role.position;
  }

  edit(options) {
    return this.guild.roles.edit(this, options);
  }

  setName(name, reason) {
    return this.edit({ name, reason });
  }

  setColor(color, reason) {
    return this.edit({ color, reason });
  }

  setHoist(hoist = true, reason) {
    return this.edit({ hoist, reason });
  }

  setMentionable(mentionable = true, reason) {
    return this.edit({ mentionable, reason });
  }

  setPermissions(permissions, reason) {
    return this.edit({ permissions, reason });
  }

  async delete(reason) {
    await this.guild.roles.delete(this, reason);
    return this;
  }

  toString() {
    return this.id === this.guildId ? "@everyone" : `<@&${this.id}>`;
  }
}

class Attachment {
  constructor(data) {
    this.id = data.id;
    this.name = data.filename;
    this.description = data.description || null;
    this.contentType = data.content_type || null;
    this.size = data.size;
    this.url = data.url;
    this.proxyURL = data.proxy_url;
    this.height = data.height === undefined ? null : data.height;
    this.width = data.width === undefined ? null : data.width;
    this.ephemeral = Boolean(data.ephemeral);
    this.spoiler = Boolean(this.name && this.name.startsWith("SPOILER_"));
  }

  toJSON() {
    return { id: this.id, filename: this.name, url: this.url, size: this.size, content_type: this.contentType };
  }
}

class ReactionEmoji {
  constructor(data) {
    this.id = data.id || null;
    this.name = data.name || null;
    this.animated = Boolean(data.animated);
  }

  get identifier() {
    return this.id ? `${this.name}:${this.id}` : this.name;
  }

  toString() {
    if (!this.id) return this.name;
    return `<${this.animated ? "a" : ""}:${this.name}:${this.id}>`;
  }
}

class MessageReaction {
  constructor(client, data, message) {
    this.client = client;
    this.message = message;
    this.emoji = new ReactionEmoji(data.emoji);
    this.count = data.count === undefined ? null : data.count;
    this.me = Boolean(data.me);
  }

  async remove() {
    const identifier = encodeURIComponent(this.emoji.identifier);
    await this.client.rest.delete(`/channels/${this.message.channelId}/messages/${this.message.id}/reactions/${identifier}/@me`);
    return this;
  }
}

/* ----------------------------------- Canais ----------------------------------- */

const TEXT_BASED = new Set([ChannelType.GuildText, ChannelType.DM, ChannelType.GuildVoice, ChannelType.GroupDM, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.GuildStageVoice]);
const VOICE_BASED = new Set([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);
const THREADS = new Set([ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread]);
const DMS = new Set([ChannelType.DM, ChannelType.GroupDM]);

class BaseChannel {
  constructor(client, data) {
    this.client = client;
    this.id = data.id;
    this.type = data.type === undefined ? ChannelType.GuildText : data.type;
    this.flags = data.flags === undefined ? 0 : data.flags;
  }

  get createdTimestamp() {
    return SnowflakeUtil.timestampFrom(this.id);
  }

  isTextBased() {
    return TEXT_BASED.has(this.type);
  }

  isSendable() {
    return TEXT_BASED.has(this.type);
  }

  isVoiceBased() {
    return VOICE_BASED.has(this.type);
  }

  isThread() {
    return THREADS.has(this.type);
  }

  isDMBased() {
    return DMS.has(this.type);
  }

  isThreadOnly() {
    return this.type === ChannelType.GuildForum || this.type === ChannelType.GuildMedia;
  }

  async fetch(force = true) {
    return this.client.channels.fetch(this.id, { force });
  }

  toString() {
    return `<#${this.id}>`;
  }
}

const TextBasedMethods = {
  get lastMessage() {
    return this.lastMessageId ? this.messages.cache.get(this.lastMessageId) || null : null;
  },

  async send(options) {
    const { body, files } = resolveMessagePayload(options, this.client);
    const data = await this.client.rest.post(`/channels/${this.id}/messages`, { body, files });
    return this.messages._add(data);
  },

  async sendTyping() {
    await this.client.rest.post(`/channels/${this.id}/typing`);
  },

  async bulkDelete(messages, filterOld = false) {
    let ids = null;

    if (typeof messages === "number") {
      const fetched = await this.messages.fetch({ limit: messages });
      const limit = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const usable = filterOld ? fetched.filter((message) => message.createdTimestamp > limit) : fetched;
      ids = usable.map((message) => message.id);
    }

    if (!ids) ids = [...(messages instanceof Map ? messages.keys() : [].concat(messages).map(managers.resolveId))];

    if (ids.length === 1) {
      await this.messages.delete(ids[0]);
      return new Collection([[ids[0], this.messages.cache.get(ids[0]) || { id: ids[0] }]]);
    }

    if (ids.length > 1) await this.client.rest.post(`/channels/${this.id}/messages/bulk-delete`, { body: { messages: ids } });

    const result = new Collection();
    for (const id of ids) {
      result.set(id, this.messages.cache.get(id) || { id });
      this.messages.cache.delete(id);
    }

    return result;
  },

  createMessageCollector(options = {}) {
    return new MessageCollector(this, options);
  },

  awaitMessages(options = {}) {
    const errors = options.errors || [];
    const collector = new MessageCollector(this, options);

    return new Promise((resolve, reject) => {
      collector.once("end", (collected, reason) => {
        if (errors.includes(reason)) return reject(collected);
        return resolve(collected);
      });
    });
  },

  createMessageComponentCollector(options = {}) {
    return new InteractionCollector(this.client, { ...options, channelId: this.id, interactionType: 3 });
  },

  awaitMessageComponent(options = {}) {
    return awaitFirst(this.createMessageComponentCollector({ ...options, max: 1 }));
  },
};

function applyTextBased(Class) {
  Object.defineProperties(Class.prototype, Object.getOwnPropertyDescriptors(TextBasedMethods));
}

class GuildChannel extends BaseChannel {
  constructor(client, data) {
    super(client, data);
    this.guildId = data.guild_id || null;
    this.permissionOverwrites = { cache: new Collection() };
    this._patch(data);
  }

  _patch(data) {
    if (data.guild_id !== undefined) this.guildId = data.guild_id;
    if (data.type !== undefined) this.type = data.type;
    if (data.name !== undefined) this.name = data.name;
    if (data.position !== undefined) this.position = data.position;
    if (data.parent_id !== undefined) this.parentId = data.parent_id;
    if (data.topic !== undefined) this.topic = data.topic;
    if (data.nsfw !== undefined) this.nsfw = data.nsfw;
    if (data.rate_limit_per_user !== undefined) this.rateLimitPerUser = data.rate_limit_per_user;
    if (data.last_message_id !== undefined) this.lastMessageId = data.last_message_id;
    if (data.bitrate !== undefined) this.bitrate = data.bitrate;
    if (data.user_limit !== undefined) this.userLimit = data.user_limit;
    if (this.name === undefined) this.name = null;
    if (this.parentId === undefined) this.parentId = null;

    if (data.permission_overwrites) {
      this.permissionOverwrites.cache.clear();

      for (const overwrite of data.permission_overwrites) {
        this.permissionOverwrites.cache.set(overwrite.id, {
          id: overwrite.id,
          type: overwrite.type,
          allow: new PermissionsBitField(overwrite.allow),
          deny: new PermissionsBitField(overwrite.deny),
        });
      }
    }
  }

  get guild() {
    return this.client.guilds.cache.get(this.guildId) || null;
  }

  get parent() {
    return this.parentId && this.guild ? this.guild.channels.cache.get(this.parentId) || null : null;
  }

  get url() {
    return `${this.client.options.web}/channels/${this.guildId}/${this.id}`;
  }

  permissionsFor(target) {
    const guild = this.guild;
    if (!guild) return null;

    const member = typeof target === "string" ? guild.members.cache.get(target) : target;
    if (!member || !member._roleIds) return null;

    const base = member.permissions;
    if (base.has(PermissionsBitField.Flags.Administrator)) return new PermissionsBitField(PermissionsBitField.All);

    let bits = base.bitfield;
    const overwrites = this.permissionOverwrites.cache;
    const everyone = overwrites.get(guild.id);

    if (everyone) bits = (bits & ~everyone.deny.bitfield) | everyone.allow.bitfield;

    let allow = 0n;
    let deny = 0n;

    for (const roleId of member._roleIds) {
      const overwrite = overwrites.get(roleId);
      if (overwrite) {
        allow |= overwrite.allow.bitfield;
        deny |= overwrite.deny.bitfield;
      }
    }

    bits = (bits & ~deny) | allow;

    const own = overwrites.get(member.id);
    if (own) bits = (bits & ~own.deny.bitfield) | own.allow.bitfield;

    return new PermissionsBitField(bits);
  }

  edit(options) {
    return this.guild.channels.edit(this, options);
  }

  setName(name, reason) {
    return this.edit({ name, reason });
  }

  setParent(parent, options = {}) {
    return this.edit({ parent, reason: options.reason });
  }

  setPosition(position, options = {}) {
    return this.edit({ position, reason: options.reason });
  }

  async delete(reason) {
    await this.guild.channels.delete(this, reason);
    return this;
  }
}

class TextChannel extends GuildChannel {
  constructor(client, data) {
    super(client, data);
    this.messages = new managers.MessageManager(this);
  }

  setTopic(topic, reason) {
    return this.edit({ topic, reason });
  }

  setNSFW(nsfw = true, reason) {
    return this.edit({ nsfw, reason });
  }

  setRateLimitPerUser(seconds, reason) {
    return this.edit({ rateLimitPerUser: seconds, reason });
  }
}

class VoiceChannel extends GuildChannel {
  constructor(client, data) {
    super(client, data);
    this.messages = new managers.MessageManager(this);
  }

  setBitrate(bitrate, reason) {
    return this.edit({ bitrate, reason });
  }

  setUserLimit(userLimit, reason) {
    return this.edit({ userLimit, reason });
  }
}

class CategoryChannel extends GuildChannel {
  get children() {
    const guild = this.guild;
    return guild ? guild.channels.cache.filter((channel) => channel.parentId === this.id) : new Collection();
  }
}

class ForumChannel extends GuildChannel {}

class ThreadChannel extends GuildChannel {
  constructor(client, data) {
    super(client, data);
    this.messages = new managers.MessageManager(this);
    this._patchThread(data);
  }

  _patch(data) {
    super._patch(data);
    if (this._patchThread) this._patchThread(data);
  }

  _patchThread(data) {
    if (data.owner_id !== undefined) this.ownerId = data.owner_id;
    if (data.message_count !== undefined) this.messageCount = data.message_count;
    if (data.member_count !== undefined) this.memberCount = data.member_count;

    if (data.thread_metadata) {
      this.archived = data.thread_metadata.archived;
      this.locked = data.thread_metadata.locked;
      this.autoArchiveDuration = data.thread_metadata.auto_archive_duration;
    }
  }

  async join() {
    await this.client.rest.put(`/channels/${this.id}/thread-members/@me`);
    return this;
  }

  async leave() {
    await this.client.rest.delete(`/channels/${this.id}/thread-members/@me`);
    return this;
  }

  async setArchived(archived = true, reason) {
    const data = await this.client.rest.patch(`/channels/${this.id}`, { body: { archived }, reason });
    this._patch(data);
    return this;
  }

  async setLocked(locked = true, reason) {
    const data = await this.client.rest.patch(`/channels/${this.id}`, { body: { locked }, reason });
    this._patch(data);
    return this;
  }

  async setName(name, reason) {
    const data = await this.client.rest.patch(`/channels/${this.id}`, { body: { name }, reason });
    this._patch(data);
    return this;
  }
}

class DMChannel extends BaseChannel {
  constructor(client, data) {
    super(client, data);
    this.guildId = null;
    this.messages = new managers.MessageManager(this);
    this.recipientId = data.recipients && data.recipients[0] ? data.recipients[0].id : data.recipient_id || null;
    this.lastMessageId = data.last_message_id || null;

    for (const recipient of data.recipients || []) client._upsertUser(recipient);
  }

  get recipient() {
    return this.recipientId ? this.client.users.cache.get(this.recipientId) || null : null;
  }

  get partial() {
    return false;
  }

  async delete() {
    await this.client.rest.delete(`/channels/${this.id}`);
    this.client.channels.cache.delete(this.id);
    return this;
  }
}

applyTextBased(TextChannel);
applyTextBased(VoiceChannel);
applyTextBased(ThreadChannel);
applyTextBased(DMChannel);

function createChannel(client, data) {
  if (data.type === ChannelType.DM || data.type === ChannelType.GroupDM) return new DMChannel(client, data);
  if (data.type === ChannelType.GuildText || data.type === ChannelType.GuildAnnouncement) return new TextChannel(client, data);
  if (data.type === ChannelType.GuildVoice || data.type === ChannelType.GuildStageVoice) return new VoiceChannel(client, data);
  if (data.type === ChannelType.GuildCategory) return new CategoryChannel(client, data);
  if (THREADS.has(data.type)) return new ThreadChannel(client, data);
  if (data.type === ChannelType.GuildForum || data.type === ChannelType.GuildMedia) return new ForumChannel(client, data);
  return new GuildChannel(client, data);
}

/* ------------------------------------ Guild ------------------------------------ */

class VoiceState {
  constructor(client, guildId, data) {
    this.client = client;
    this.guildId = guildId;
    this.id = data.user_id;
    this.channelId = data.channel_id || null;
    this.sessionId = data.session_id;
    this.serverDeaf = Boolean(data.deaf);
    this.serverMute = Boolean(data.mute);
    this.selfDeaf = Boolean(data.self_deaf);
    this.selfMute = Boolean(data.self_mute);
    this.selfVideo = Boolean(data.self_video);
    this.streaming = Boolean(data.self_stream);
    this.suppress = Boolean(data.suppress);
    this.member = data.member ? client.guilds.cache.get(guildId) && client.guilds.cache.get(guildId).members._add(data.member) : null;
  }

  get guild() {
    return this.client.guilds.cache.get(this.guildId) || null;
  }

  get channel() {
    return this.channelId ? this.client.channels.cache.get(this.channelId) || null : null;
  }

  get mute() {
    return this.serverMute || this.selfMute;
  }

  get deaf() {
    return this.serverDeaf || this.selfDeaf;
  }
}

class Presence {
  constructor(client, data) {
    this.client = client;
    this.userId = data.user.id;
    this.guildId = data.guild_id || null;
    this.status = data.status;
    this.activities = data.activities || [];
    this.clientStatus = data.client_status || null;
  }

  get user() {
    return this.client.users.cache.get(this.userId) || null;
  }

  get guild() {
    return this.guildId ? this.client.guilds.cache.get(this.guildId) || null : null;
  }

  get member() {
    return this.guild ? this.guild.members.cache.get(this.userId) || null : null;
  }
}

class Guild {
  constructor(client, data) {
    this.client = client;
    this.id = data.id;
    this.members = new managers.GuildMemberManager(this);
    this.channels = new managers.GuildChannelManager(this);
    this.roles = new managers.RoleManager(this);
    this.bans = new managers.GuildBanManager(this);
    this.commands = new managers.ApplicationCommandManager(client, this.id);
    this.voiceStates = { cache: new Collection() };
    this.presences = { cache: new Collection() };
    this.available = true;
    this._patch(data);
  }

  _patch(data) {
    if (data.name !== undefined) this.name = data.name;
    if (data.icon !== undefined) this.icon = data.icon;
    if (data.banner !== undefined) this.banner = data.banner;
    if (data.description !== undefined) this.description = data.description;
    if (data.owner_id !== undefined) this.ownerId = data.owner_id;
    if (data.member_count !== undefined) this.memberCount = data.member_count;
    if (data.approximate_member_count !== undefined && this.memberCount === undefined) this.memberCount = data.approximate_member_count;
    if (data.large !== undefined) this.large = data.large;
    if (data.preferred_locale !== undefined) this.preferredLocale = data.preferred_locale;
    if (data.system_channel_id !== undefined) this.systemChannelId = data.system_channel_id;
    if (data.premium_tier !== undefined) this.premiumTier = data.premium_tier;
    if (data.joined_at !== undefined) this.joinedTimestamp = Date.parse(data.joined_at);
    if (data.unavailable !== undefined) this.available = !data.unavailable;

    for (const role of data.roles || []) this.roles._add(role);
    for (const channel of data.channels || []) this.channels._add(channel);
    for (const thread of data.threads || []) this.channels._add(thread);
    for (const member of data.members || []) {
      if (member.user) this.members._add(member);
    }

    for (const state of data.voice_states || []) {
      this.voiceStates.cache.set(state.user_id, new VoiceState(this.client, this.id, state));
    }

    for (const presence of data.presences || []) {
      this.presences.cache.set(presence.user.id, new Presence(this.client, { ...presence, guild_id: this.id }));
    }
  }

  get createdTimestamp() {
    return SnowflakeUtil.timestampFrom(this.id);
  }

  get joinedAt() {
    return this.joinedTimestamp ? new Date(this.joinedTimestamp) : null;
  }

  get me() {
    return this.members.me;
  }

  get systemChannel() {
    return this.systemChannelId ? this.channels.cache.get(this.systemChannelId) || null : null;
  }

  iconURL(options) {
    return this.icon ? imageURL(this.client, `icons/${this.id}`, this.icon, options) : null;
  }

  bannerURL(options) {
    return this.banner ? imageURL(this.client, `banners/${this.id}`, this.banner, options) : null;
  }

  fetch() {
    return this.client.guilds.fetch(this.id);
  }

  fetchOwner() {
    return this.members.fetch(this.ownerId);
  }

  async edit(options) {
    const body = {};

    if (options.name !== undefined) body.name = options.name;
    if (options.description !== undefined) body.description = options.description;
    if (options.icon !== undefined) body.icon = options.icon === null ? null : await toDataURI(this.client, options.icon);
    if (options.systemChannel !== undefined) body.system_channel_id = managers.resolveId(options.systemChannel);

    const data = await this.client.rest.patch(`/guilds/${this.id}`, { body, reason: options.reason });
    this._patch(data);
    return this;
  }

  setName(name, reason) {
    return this.edit({ name, reason });
  }

  async leave() {
    await this.client.rest.delete(`/users/@me/guilds/${this.id}`);
    this.client.guilds.cache.delete(this.id);
    return this;
  }

  async delete() {
    await this.client.rest.delete(`/guilds/${this.id}`);
    this.client.guilds.cache.delete(this.id);
    return this;
  }

  toString() {
    return this.name;
  }
}

module.exports = {
  imageURL,
  toDataURI,
  User,
  ClientUser,
  GuildMember,
  Role,
  Attachment,
  ReactionEmoji,
  MessageReaction,
  BaseChannel,
  GuildChannel,
  TextChannel,
  VoiceChannel,
  CategoryChannel,
  ForumChannel,
  ThreadChannel,
  DMChannel,
  createChannel,
  VoiceState,
  Presence,
  Guild,
};

require("./messages");
