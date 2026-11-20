const Collection = require("../util/Collection");
const { PermissionsBitField } = require("../util/BitField");
const { resolveEmojiIdentifier } = require("../util/Util");
const { resolveMessagePayload } = require("../structures/MessagePayload");

// As estruturas sao carregadas sob demanda para evitar dependencia circular.
function S() {
  return require("../structures");
}

function resolveId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.id) return value.id;
  return null;
}

function commandToJSON(command) {
  if (command && typeof command.toJSON === "function") return command.toJSON();

  const type = command.type || 1;
  const json = { name: command.name, type };

  if (type === 1) json.description = command.description || "";
  if (command.options) json.options = command.options.map((option) => (option.toJSON ? option.toJSON() : option));

  const perms = command.defaultMemberPermissions !== undefined ? command.defaultMemberPermissions : command.default_member_permissions;
  if (perms !== undefined) json.default_member_permissions = perms === null ? null : PermissionsBitField.resolve(perms).toString();

  const dm = command.dmPermission !== undefined ? command.dmPermission : command.dm_permission;
  if (dm !== undefined) json.dm_permission = dm;

  if (command.nsfw !== undefined) json.nsfw = command.nsfw;
  if (command.contexts) json.contexts = command.contexts;
  if (command.integration_types) json.integration_types = command.integration_types;
  if (command.integrationTypes) json.integration_types = command.integrationTypes;
  if (command.nameLocalizations) json.name_localizations = command.nameLocalizations;
  if (command.name_localizations) json.name_localizations = command.name_localizations;
  if (command.descriptionLocalizations) json.description_localizations = command.descriptionLocalizations;
  if (command.description_localizations) json.description_localizations = command.description_localizations;

  return json;
}

function overwritesToJSON(overwrites) {
  return overwrites.map((overwrite) => ({
    id: resolveId(overwrite),
    type: overwrite.type,
    allow: overwrite.allow === undefined ? "0" : PermissionsBitField.resolve(overwrite.allow).toString(),
    deny: overwrite.deny === undefined ? "0" : PermissionsBitField.resolve(overwrite.deny).toString(),
  }));
}

function channelOptionsToJSON(options) {
  const json = {};
  const direct = ["name", "type", "topic", "nsfw", "bitrate", "position", "flags"];

  for (const key of direct) {
    if (options[key] !== undefined) json[key] = options[key];
  }

  if (options.userLimit !== undefined) json.user_limit = options.userLimit;
  if (options.rateLimitPerUser !== undefined) json.rate_limit_per_user = options.rateLimitPerUser;
  if (options.defaultAutoArchiveDuration !== undefined) json.default_auto_archive_duration = options.defaultAutoArchiveDuration;
  if (options.rtcRegion !== undefined) json.rtc_region = options.rtcRegion;
  if (options.parent !== undefined) json.parent_id = resolveId(options.parent);
  if (options.permissionOverwrites !== undefined) json.permission_overwrites = overwritesToJSON(options.permissionOverwrites);

  return json;
}

class BaseManager {
  constructor(client) {
    this.client = client;
  }
}

class CachedManager extends BaseManager {
  constructor(client, cache) {
    super(client);
    this.cache = cache || new Collection();
  }

  resolve(idOrInstance) {
    if (typeof idOrInstance === "object" && idOrInstance !== null && idOrInstance.id) return this.cache.get(idOrInstance.id) || idOrInstance;
    if (typeof idOrInstance === "string") return this.cache.get(idOrInstance) || null;
    return null;
  }

  resolveId(idOrInstance) {
    return resolveId(idOrInstance);
  }
}

class UserManager extends CachedManager {
  async fetch(user, { force = false, cache = true } = {}) {
    const id = resolveId(user);
    const cached = this.cache.get(id);

    if (!force && cached && !cached.partial) return cached;

    const data = await this.client.rest.get(`/users/${id}`);
    if (!cache) return new (S().User)(this.client, data);
    return this.client._upsertUser(data);
  }

  async createDM(user) {
    const id = resolveId(user);
    const existing = this.client.channels.cache.find((channel) => channel.isDMBased() && channel.recipientId === id);
    if (existing) return existing;

    const data = await this.client.rest.post("/users/@me/channels", { body: { recipient_id: id } });
    const channel = S().createChannel(this.client, data);
    this.client.channels.cache.set(channel.id, channel);
    return channel;
  }

  async send(user, options) {
    const dm = await this.createDM(user);
    return dm.send(options);
  }
}

class GuildManager extends CachedManager {
  async fetch(guild, { withCounts = true } = {}) {
    const id = resolveId(guild);

    if (!id) {
      const list = await this.client.rest.get("/users/@me/guilds");
      const result = new Collection();
      for (const item of list) result.set(item.id, item);
      return result;
    }

    const data = await this.client.rest.get(`/guilds/${id}`, { query: { with_counts: withCounts } });
    const cached = this.cache.get(id);

    if (cached) {
      cached._patch(data);
      return cached;
    }

    const instance = new (S().Guild)(this.client, data);
    this.cache.set(instance.id, instance);
    return instance;
  }
}

class ChannelManager extends CachedManager {
  async fetch(channel, { force = false, cache = true } = {}) {
    const id = resolveId(channel);
    const cached = this.cache.get(id);

    if (!force && cached) return cached;

    const data = await this.client.rest.get(`/channels/${id}`);
    const instance = S().createChannel(this.client, data);

    if (cache) {
      this.cache.set(instance.id, instance);
      const guild = instance.guildId ? this.client.guilds.cache.get(instance.guildId) : null;
      if (guild) guild.channels.cache.set(instance.id, instance);
    }

    return instance;
  }
}

class GuildChannelManager extends CachedManager {
  constructor(guild) {
    super(guild.client);
    this.guild = guild;
  }

  _add(data) {
    const existing = this.cache.get(data.id);

    if (existing) {
      existing._patch({ ...data, guild_id: this.guild.id });
      return existing;
    }

    const instance = S().createChannel(this.client, { ...data, guild_id: this.guild.id });
    this.cache.set(instance.id, instance);
    this.client.channels.cache.set(instance.id, instance);
    return instance;
  }

  async fetch(channel, { force = false } = {}) {
    const id = resolveId(channel);

    if (id) {
      const cached = this.cache.get(id);
      if (!force && cached) return cached;
      return this._add(await this.client.rest.get(`/channels/${id}`));
    }

    const list = await this.client.rest.get(`/guilds/${this.guild.id}/channels`);
    const result = new Collection();
    for (const item of list) result.set(item.id, this._add(item));
    return result;
  }

  async create(options) {
    const body = channelOptionsToJSON(options);
    const data = await this.client.rest.post(`/guilds/${this.guild.id}/channels`, { body, reason: options.reason });
    return this._add(data);
  }

  async edit(channel, options) {
    const id = resolveId(channel);
    const data = await this.client.rest.patch(`/channels/${id}`, { body: channelOptionsToJSON(options), reason: options.reason });
    return this._add(data);
  }

  async delete(channel, reason) {
    const id = resolveId(channel);
    await this.client.rest.delete(`/channels/${id}`, { reason });
    this.cache.delete(id);
    this.client.channels.cache.delete(id);
  }
}

class GuildMemberManager extends CachedManager {
  constructor(guild) {
    super(guild.client);
    this.guild = guild;
  }

  get me() {
    return this.client.user ? this.cache.get(this.client.user.id) || null : null;
  }

  _add(data) {
    const userId = data.user ? data.user.id : data.id;
    const existing = this.cache.get(userId);

    if (existing) {
      existing._patch(data);
      return existing;
    }

    const member = new (S().GuildMember)(this.client, this.guild.id, data);
    this.cache.set(member.id, member);
    return member;
  }

  async fetch(options) {
    const id = resolveId(options) || (options && options.user ? resolveId(options.user) : null);

    if (id) {
      const cached = this.cache.get(id);
      if (cached && !(options && options.force)) return cached;
      return this._add(await this.client.rest.get(`/guilds/${this.guild.id}/members/${id}`));
    }

    const query = {};
    const result = new Collection();
    let list = null;

    if (options && options.query !== undefined) {
      query.query = options.query;
      query.limit = options.limit || 100;
      list = await this.client.rest.get(`/guilds/${this.guild.id}/members/search`, { query });
    }

    if (!list) {
      query.limit = (options && options.limit) || 1000;
      if (options && options.after) query.after = options.after;
      list = await this.client.rest.get(`/guilds/${this.guild.id}/members`, { query });
    }

    for (const item of list) result.set(item.user.id, this._add(item));
    return result;
  }

  search({ query, limit = 100 } = {}) {
    return this.fetch({ query, limit });
  }

  async edit(user, options) {
    const id = resolveId(user);
    const body = {};

    if (options.nick !== undefined) body.nick = options.nick;
    if (options.roles !== undefined) body.roles = options.roles.map(resolveId);
    if (options.mute !== undefined) body.mute = options.mute;
    if (options.deaf !== undefined) body.deaf = options.deaf;
    if (options.channel !== undefined) body.channel_id = resolveId(options.channel);
    if (options.communicationDisabledUntil !== undefined) body.communication_disabled_until = options.communicationDisabledUntil === null ? null : new Date(options.communicationDisabledUntil).toISOString();

    const data = await this.client.rest.patch(`/guilds/${this.guild.id}/members/${id}`, { body, reason: options.reason });
    return this._add(data);
  }

  async kick(user, reason) {
    const id = resolveId(user);
    await this.client.rest.delete(`/guilds/${this.guild.id}/members/${id}`, { reason });
    return this.cache.get(id) || id;
  }

  async ban(user, options = {}) {
    const id = resolveId(user);
    const body = {};
    const seconds = options.deleteMessageSeconds !== undefined ? options.deleteMessageSeconds : options.deleteMessageDays !== undefined ? options.deleteMessageDays * 86400 : undefined;

    if (seconds !== undefined) body.delete_message_seconds = seconds;

    await this.client.rest.put(`/guilds/${this.guild.id}/bans/${id}`, { body, reason: options.reason });
    return this.cache.get(id) || this.client.users.cache.get(id) || id;
  }

  async unban(user, reason) {
    const id = resolveId(user);
    await this.client.rest.delete(`/guilds/${this.guild.id}/bans/${id}`, { reason });
    return this.client.users.cache.get(id) || id;
  }
}

class GuildMemberRoleManager {
  constructor(member) {
    this.member = member;
    this.guild = member.guild;
  }

  get cache() {
    const guild = this.member.guild;
    const result = new Collection();
    if (!guild) return result;

    const everyone = guild.roles.cache.get(guild.id);
    if (everyone) result.set(everyone.id, everyone);

    for (const roleId of this.member._roleIds) {
      const role = guild.roles.cache.get(roleId);
      if (role) result.set(role.id, role);
    }

    return result;
  }

  get highest() {
    return this.cache.reduce((highest, role) => (role.position > highest.position ? role : highest), this.cache.first());
  }

  get hoist() {
    return this.cache.filter((role) => role.hoist).sort((a, b) => b.position - a.position).first() || null;
  }

  get color() {
    return this.cache.filter((role) => role.color !== 0).sort((a, b) => b.position - a.position).first() || null;
  }

  async add(roles, reason) {
    const list = [].concat(roles).map(resolveId);

    for (const roleId of list) {
      await this.member.client.rest.put(`/guilds/${this.member.guildId}/members/${this.member.id}/roles/${roleId}`, { reason });
      if (!this.member._roleIds.includes(roleId)) this.member._roleIds.push(roleId);
    }

    return this.member;
  }

  async remove(roles, reason) {
    const list = [].concat(roles).map(resolveId);

    for (const roleId of list) {
      await this.member.client.rest.delete(`/guilds/${this.member.guildId}/members/${this.member.id}/roles/${roleId}`, { reason });
      this.member._roleIds = this.member._roleIds.filter((id) => id !== roleId);
    }

    return this.member;
  }

  async set(roles, reason) {
    const ids = [].concat(roles).map(resolveId);
    await this.member.client.rest.patch(`/guilds/${this.member.guildId}/members/${this.member.id}`, { body: { roles: ids }, reason });
    this.member._roleIds = ids;
    return this.member;
  }
}

class RoleManager extends CachedManager {
  constructor(guild) {
    super(guild.client);
    this.guild = guild;
  }

  get everyone() {
    return this.cache.get(this.guild.id) || null;
  }

  _add(data) {
    const existing = this.cache.get(data.id);

    if (existing) {
      existing._patch(data);
      return existing;
    }

    const role = new (S().Role)(this.client, data, this.guild);
    this.cache.set(role.id, role);
    return role;
  }

  async fetch(role) {
    const list = await this.client.rest.get(`/guilds/${this.guild.id}/roles`);
    const result = new Collection();
    for (const item of list) result.set(item.id, this._add(item));

    const id = resolveId(role);
    return id ? result.get(id) || null : result;
  }

  roleBody(options) {
    const body = {};

    if (options.name !== undefined) body.name = options.name;
    if (options.color !== undefined) body.color = require("../util/Util").resolveColor(options.color);
    if (options.hoist !== undefined) body.hoist = options.hoist;
    if (options.mentionable !== undefined) body.mentionable = options.mentionable;
    if (options.permissions !== undefined) body.permissions = PermissionsBitField.resolve(options.permissions).toString();
    if (options.icon !== undefined) body.icon = options.icon;
    if (options.unicodeEmoji !== undefined) body.unicode_emoji = options.unicodeEmoji;

    return body;
  }

  async create(options = {}) {
    const data = await this.client.rest.post(`/guilds/${this.guild.id}/roles`, { body: this.roleBody(options), reason: options.reason });
    return this._add(data);
  }

  async edit(role, options) {
    const data = await this.client.rest.patch(`/guilds/${this.guild.id}/roles/${resolveId(role)}`, { body: this.roleBody(options), reason: options.reason });
    return this._add(data);
  }

  async delete(role, reason) {
    const id = resolveId(role);
    await this.client.rest.delete(`/guilds/${this.guild.id}/roles/${id}`, { reason });
    this.cache.delete(id);
  }
}

class GuildBanManager extends CachedManager {
  constructor(guild) {
    super(guild.client);
    this.guild = guild;
  }

  async fetch(user) {
    const id = resolveId(user);

    if (id) {
      const data = await this.client.rest.get(`/guilds/${this.guild.id}/bans/${id}`);
      return { user: this.client._upsertUser(data.user), reason: data.reason || null, guild: this.guild };
    }

    const list = await this.client.rest.get(`/guilds/${this.guild.id}/bans`, { query: { limit: 1000 } });
    const result = new Collection();

    for (const item of list) result.set(item.user.id, { user: this.client._upsertUser(item.user), reason: item.reason || null, guild: this.guild });

    return result;
  }

  create(user, options = {}) {
    return this.guild.members.ban(user, options);
  }

  remove(user, reason) {
    return this.guild.members.unban(user, reason);
  }
}

class MessageManager extends CachedManager {
  constructor(channel) {
    super(channel.client);
    this.channel = channel;
  }

  _add(data) {
    const existing = this.cache.get(data.id);
    const message = existing || new (S().Message)(this.client, data);

    if (existing) existing._patch(data);

    this.cache.set(message.id, message);

    const limit = this.client.options.messageCacheMaxSize;

    if (limit >= 0) {
      while (this.cache.size > limit) this.cache.delete(this.cache.firstKey());
    }

    return message;
  }

  async fetch(options = {}, { force = true } = {}) {
    const id = typeof options === "string" ? options : options.message ? resolveId(options.message) : null;

    if (id) {
      const cached = this.cache.get(id);
      if (!force && cached) return cached;
      return this._add(await this.client.rest.get(`/channels/${this.channel.id}/messages/${id}`));
    }

    const list = await this.client.rest.get(`/channels/${this.channel.id}/messages`, {
      query: { limit: options.limit || 50, before: options.before, after: options.after, around: options.around },
    });

    const result = new Collection();
    for (const item of list) result.set(item.id, this._add(item));
    return result;
  }

  async fetchPinned() {
    const list = await this.client.rest.get(`/channels/${this.channel.id}/pins`);
    const result = new Collection();
    for (const item of list) result.set(item.id, this._add(item));
    return result;
  }

  async edit(message, options) {
    const { body, files } = resolveMessagePayload(options, this.client);
    const data = await this.client.rest.patch(`/channels/${this.channel.id}/messages/${resolveId(message)}`, { body, files });
    return this._add(data);
  }

  async delete(message) {
    const id = resolveId(message);
    await this.client.rest.delete(`/channels/${this.channel.id}/messages/${id}`);
    this.cache.delete(id);
  }

  async react(message, emoji) {
    const identifier = encodeURIComponent(resolveEmojiIdentifier(emoji));
    await this.client.rest.put(`/channels/${this.channel.id}/messages/${resolveId(message)}/reactions/${identifier}/@me`);
  }

  async pin(message, reason) {
    await this.client.rest.put(`/channels/${this.channel.id}/pins/${resolveId(message)}`, { reason });
  }

  async unpin(message, reason) {
    await this.client.rest.delete(`/channels/${this.channel.id}/pins/${resolveId(message)}`, { reason });
  }
}

class ApplicationCommandManager extends CachedManager {
  constructor(client, guildId = null) {
    super(client);
    this.guildId = guildId;
  }

  get base() {
    const app = this.client.application;
    if (!app) throw new Error("The client is not ready yet: wait for the clientReady event before managing commands.");
    return this.guildId ? `/applications/${app.id}/guilds/${this.guildId}/commands` : `/applications/${app.id}/commands`;
  }

  _add(data) {
    const command = new (S().ApplicationCommand)(this.client, data, this);
    this.cache.set(command.id, command);
    return command;
  }

  async fetch(id) {
    if (id) return this._add(await this.client.rest.get(`${this.base}/${resolveId(id)}`));

    const list = await this.client.rest.get(this.base, { query: { with_localizations: true } });
    const result = new Collection();
    for (const item of list) result.set(item.id, this._add(item));
    return result;
  }

  async set(commands) {
    const list = await this.client.rest.put(this.base, { body: commands.map(commandToJSON) });
    this.cache.clear();

    const result = new Collection();
    for (const item of list || []) result.set(item.id, this._add(item));
    return result;
  }

  async create(command) {
    return this._add(await this.client.rest.post(this.base, { body: commandToJSON(command) }));
  }

  async edit(command, data) {
    return this._add(await this.client.rest.patch(`${this.base}/${resolveId(command)}`, { body: commandToJSON(data) }));
  }

  async delete(command) {
    const id = resolveId(command);
    await this.client.rest.delete(`${this.base}/${id}`);
    const cached = this.cache.get(id);
    this.cache.delete(id);
    return cached || null;
  }
}

module.exports = {
  BaseManager,
  CachedManager,
  UserManager,
  GuildManager,
  ChannelManager,
  GuildChannelManager,
  GuildMemberManager,
  GuildMemberRoleManager,
  RoleManager,
  GuildBanManager,
  MessageManager,
  ApplicationCommandManager,
  commandToJSON,
  resolveId,
};
