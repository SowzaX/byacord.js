const Collection = require("../util/Collection");
const { PermissionsBitField, MessageFlagsBitField } = require("../util/BitField");
const { InteractionType, ComponentType, ApplicationCommandType, ApplicationCommandOptionType, MessageFlags, MessageType } = require("../util/constants");
const { SnowflakeUtil, parseEmoji } = require("../util/Util");
const { resolveMessagePayload } = require("./MessagePayload");
const { InteractionCollector, awaitFirst } = require("./Collectors");
const managers = require("../managers");
const S = require("./index");

/* ---------------------------------- Mensagens ---------------------------------- */

class MessageMentions {
  constructor(message, data) {
    const client = message.client;

    this.message = message;
    this.everyone = Boolean(data.mention_everyone);
    this.users = new Collection();
    this.roles = new Collection();
    this.repliedUser = null;

    for (const raw of data.mentions || []) {
      const user = client._upsertUser(raw);
      this.users.set(user.id, user);
    }

    for (const roleId of data.mention_roles || []) {
      const guild = message.guild;
      const role = guild ? guild.roles.cache.get(roleId) : null;
      this.roles.set(roleId, role || { id: roleId });
    }

    const replied = data.referenced_message && data.referenced_message.author;
    if (replied && this.users.has(replied.id)) this.repliedUser = this.users.get(replied.id);
  }

  get members() {
    const guild = this.message.guild;
    if (!guild) return null;
    return this.users.filter((user) => guild.members.cache.has(user.id)).mapValues((user) => guild.members.cache.get(user.id));
  }

  has(target, { ignoreRoles = false, ignoreEveryone = false } = {}) {
    const id = managers.resolveId(target);

    if (!ignoreEveryone && this.everyone) return true;
    if (this.users.has(id)) return true;
    if (this.roles.has(id)) return true;

    if (!ignoreRoles && target && target._roleIds) return target._roleIds.some((roleId) => this.roles.has(roleId));

    return false;
  }
}

class Message {
  constructor(client, data) {
    this.client = client;
    this.id = data.id;
    this.channelId = data.channel_id || null;
    this.guildId = data.guild_id || null;
    this.partial = data.author === undefined && data.content === undefined;
    this.content = this.partial ? null : "";
    this.author = null;
    this.member = null;
    this.flags = new MessageFlagsBitField(0);
    this.components = [];
    this.embeds = [];
    this.attachments = new Collection();
    this.reactions = {
      cache: new Collection(),
      removeAll: async () => {
        await this.client.rest.delete(`/channels/${this.channelId}/messages/${this.id}/reactions`);
        this.reactions.cache.clear();
        return this;
      },
    };
    this.mentions = new MessageMentions(this, {});
    this.tts = false;
    this.pinned = false;
    this.type = MessageType.Default;
    this.reference = null;
    this.editedTimestamp = null;
    this.createdTimestamp = SnowflakeUtil.timestampFrom(this.id);
    this._patch(data);
  }

  _patch(data) {
    if (data.channel_id !== undefined) this.channelId = data.channel_id;
    if (data.guild_id !== undefined) this.guildId = data.guild_id;

    if (!this.guildId && this.channelId) {
      const channel = this.client.channels.cache.get(this.channelId);
      if (channel && channel.guildId) this.guildId = channel.guildId;
    }

    if (data.content !== undefined) this.content = data.content;
    if (data.tts !== undefined) this.tts = data.tts;
    if (data.pinned !== undefined) this.pinned = data.pinned;
    if (data.type !== undefined) this.type = data.type;
    if (data.flags !== undefined) this.flags = new MessageFlagsBitField(data.flags);
    if (data.webhook_id !== undefined) this.webhookId = data.webhook_id;
    if (data.application_id !== undefined) this.applicationId = data.application_id;
    if (data.components !== undefined) this.components = data.components;
    if (data.embeds !== undefined) this.embeds = data.embeds;
    if (data.stickers !== undefined) this.stickers = data.stickers;
    if (data.poll !== undefined) this.poll = data.poll;
    if (data.interaction !== undefined) this.interaction = data.interaction;
    if (data.interaction_metadata !== undefined) this.interactionMetadata = data.interaction_metadata;
    if (data.thread !== undefined) this.thread = data.thread;
    if (data.timestamp !== undefined) this.createdTimestamp = Date.parse(data.timestamp);
    if (data.edited_timestamp !== undefined) this.editedTimestamp = data.edited_timestamp ? Date.parse(data.edited_timestamp) : null;

    if (data.message_reference) {
      this.reference = { messageId: data.message_reference.message_id, channelId: data.message_reference.channel_id, guildId: data.message_reference.guild_id };
    }

    if (data.author) {
      this.author = this.client._upsertUser(data.author);
      this.partial = false;
    }

    if (data.member && this.author && this.guildId) {
      const guild = this.guild;
      const memberData = { ...data.member, user: data.author };
      this.member = guild ? guild.members._add(memberData) : new S.GuildMember(this.client, this.guildId, memberData);
    }

    if (data.attachments !== undefined) {
      this.attachments = new Collection();
      for (const raw of data.attachments) this.attachments.set(raw.id, new S.Attachment(raw));
    }

    if (data.reactions !== undefined) {
      this.reactions.cache.clear();
      for (const raw of data.reactions) {
        const reaction = new S.MessageReaction(this.client, raw, this);
        this.reactions.cache.set(reaction.emoji.id || reaction.emoji.name, reaction);
      }
    }

    if (data.mentions !== undefined || data.mention_roles !== undefined || data.mention_everyone !== undefined) this.mentions = new MessageMentions(this, data);
  }

  get channel() {
    const cached = this.client.channels.cache.get(this.channelId);
    if (cached) return cached;

    const stub = S.createChannel(this.client, { id: this.channelId, type: this.guildId ? 0 : 1, guild_id: this.guildId });
    this.client.channels.cache.set(stub.id, stub);
    return stub;
  }

  get guild() {
    return this.guildId ? this.client.guilds.cache.get(this.guildId) || null : null;
  }

  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  get editedAt() {
    return this.editedTimestamp ? new Date(this.editedTimestamp) : null;
  }

  get url() {
    return `${this.client.options.web}/channels/${this.guildId || "@me"}/${this.channelId}/${this.id}`;
  }

  get system() {
    return ![MessageType.Default, MessageType.Reply, MessageType.ChatInputCommand, MessageType.ContextMenuCommand].includes(this.type);
  }

  get editable() {
    return Boolean(this.author) && Boolean(this.client.user) && this.author.id === this.client.user.id;
  }

  get cleanContent() {
    let text = this.content || "";

    text = text.replace(/<@!?([\w-]+)>/g, (match, id) => {
      const user = this.mentions.users.get(id);
      return user ? `@${user.username}` : match;
    });

    text = text.replace(/<@&([\w-]+)>/g, (match, id) => {
      const role = this.mentions.roles.get(id);
      return role && role.name ? `@${role.name}` : match;
    });

    text = text.replace(/<#([\w-]+)>/g, (match, id) => {
      const channel = this.client.channels.cache.get(id);
      return channel && channel.name ? `#${channel.name}` : match;
    });

    return text.replace(/@(everyone|here)/g, "@\u200b$1");
  }

  inGuild() {
    return Boolean(this.guildId);
  }

  resolveComponent(customId) {
    const search = (items) => {
      for (const item of items || []) {
        if (item.custom_id === customId) return item;
        const nested = search(item.components) || (item.accessory ? search([item.accessory]) : null);
        if (nested) return nested;
      }
      return null;
    };

    return search(this.components);
  }

  async fetch(force = true) {
    return this.channel.messages.fetch(this.id, { force });
  }

  async fetchReference() {
    if (!this.reference || !this.reference.messageId) throw new Error("This message does not reference another message.");
    const channel = await this.client.channels.fetch(this.reference.channelId || this.channelId);
    return channel.messages.fetch(this.reference.messageId);
  }

  edit(options) {
    return this.channel.messages.edit(this, options);
  }

  async delete() {
    await this.channel.messages.delete(this.id);
    return this;
  }

  reply(options) {
    const payload = typeof options === "string" ? { content: options } : { ...options };
    payload.reply = { messageReference: this.id, failIfNotExists: false, ...(payload.reply || {}) };
    return this.channel.send(payload);
  }

  async react(emoji) {
    await this.channel.messages.react(this, emoji);
    return new S.MessageReaction(this.client, { emoji: parseEmoji(emoji), me: true }, this);
  }

  async pin(reason) {
    await this.channel.messages.pin(this, reason);
    this.pinned = true;
    return this;
  }

  async unpin(reason) {
    await this.channel.messages.unpin(this, reason);
    this.pinned = false;
    return this;
  }

  async crosspost() {
    const data = await this.client.rest.post(`/channels/${this.channelId}/messages/${this.id}/crosspost`);
    return this.channel.messages._add(data);
  }

  async startThread({ name, autoArchiveDuration, reason } = {}) {
    const data = await this.client.rest.post(`/channels/${this.channelId}/messages/${this.id}/threads`, {
      body: { name, auto_archive_duration: autoArchiveDuration },
      reason,
    });

    const thread = S.createChannel(this.client, { ...data, guild_id: this.guildId });
    this.client.channels.cache.set(thread.id, thread);
    return thread;
  }

  createMessageComponentCollector(options = {}) {
    return new InteractionCollector(this.client, { ...options, messageId: this.id, interactionType: InteractionType.MessageComponent });
  }

  awaitMessageComponent(options = {}) {
    return awaitFirst(this.createMessageComponentCollector({ ...options, max: 1 }));
  }

  toString() {
    return this.content;
  }
}

/* ------------------------------ Aplicacao e comandos ------------------------------ */

class ApplicationCommand {
  constructor(client, data, manager) {
    this.client = client;
    this.manager = manager;
    this.id = data.id;
    this.applicationId = data.application_id;
    this.guildId = data.guild_id || (manager ? manager.guildId : null) || null;
    this.type = data.type || ApplicationCommandType.ChatInput;
    this.name = data.name;
    this.description = data.description || "";
    this.options = data.options || [];
    this.version = data.version;
    this.nsfw = Boolean(data.nsfw);
    this.dmPermission = data.dm_permission === undefined ? null : data.dm_permission;
    this.defaultMemberPermissions = data.default_member_permissions ? new PermissionsBitField(data.default_member_permissions) : null;
  }

  edit(data) {
    return this.manager.edit(this, data);
  }

  delete() {
    return this.manager.delete(this);
  }

  toString() {
    return `</${this.name}:${this.id}>`;
  }
}

class ClientApplication {
  constructor(client, data) {
    this.client = client;
    this.id = data.id;
    this.commands = new managers.ApplicationCommandManager(client);
    this._patch(data);
  }

  _patch(data) {
    if (data.name !== undefined) this.name = data.name;
    if (data.description !== undefined) this.description = data.description;
    if (data.icon !== undefined) this.icon = data.icon;
    if (data.flags !== undefined) this.flags = data.flags;
    if (data.owner !== undefined) this.owner = data.owner;
    if (data.bot_public !== undefined) this.botPublic = data.bot_public;
    if (data.team !== undefined) this.team = data.team;
  }

  async fetch() {
    this._patch(await this.client.rest.get("/applications/@me"));
    return this;
  }

  async edit(options) {
    const body = {};
    if (options.description !== undefined) body.description = options.description;
    if (options.interactionsEndpointUrl !== undefined) body.interactions_endpoint_url = options.interactionsEndpointUrl;
    this._patch(await this.client.rest.patch("/applications/@me", { body }));
    return this;
  }
}

/* --------------------------------- Interacoes --------------------------------- */

class CommandInteractionOptionResolver {
  constructor(client, options, resolved, guildId) {
    this.client = client;
    this.guildId = guildId;
    this._resolved = resolved || {};
    this._group = null;
    this._subcommand = null;
    this._hoisted = options || [];

    if (this._hoisted[0] && this._hoisted[0].type === ApplicationCommandOptionType.SubcommandGroup) {
      this._group = this._hoisted[0].name;
      this._hoisted = this._hoisted[0].options || [];
    }

    if (this._hoisted[0] && this._hoisted[0].type === ApplicationCommandOptionType.Subcommand) {
      this._subcommand = this._hoisted[0].name;
      this._hoisted = this._hoisted[0].options || [];
    }

    this.data = options || [];
  }

  get(name, required = false) {
    const option = this._hoisted.find((item) => item.name === name);
    if (!option && required) throw new TypeError(`Required option "${name}" was not found.`);
    return option || null;
  }

  _typed(name, types, required) {
    const option = this.get(name, required);
    if (!option) return null;
    if (!types.includes(option.type)) throw new TypeError(`Option "${name}" has type ${option.type}, expected ${types.join(" or ")}.`);
    return option;
  }

  getSubcommand(required = true) {
    if (required && !this._subcommand) throw new TypeError("No subcommand was found.");
    return this._subcommand;
  }

  getSubcommandGroup(required = false) {
    if (required && !this._group) throw new TypeError("No subcommand group was found.");
    return this._group;
  }

  getBoolean(name, required = false) {
    const option = this._typed(name, [ApplicationCommandOptionType.Boolean], required);
    return option ? option.value : null;
  }

  getString(name, required = false) {
    const option = this._typed(name, [ApplicationCommandOptionType.String], required);
    return option ? option.value : null;
  }

  getInteger(name, required = false) {
    const option = this._typed(name, [ApplicationCommandOptionType.Integer], required);
    return option ? option.value : null;
  }

  getNumber(name, required = false) {
    const option = this._typed(name, [ApplicationCommandOptionType.Number], required);
    return option ? option.value : null;
  }

  getUser(name, required = false) {
    const option = this._typed(name, [ApplicationCommandOptionType.User, ApplicationCommandOptionType.Mentionable], required);
    const raw = option && this._resolved.users ? this._resolved.users[option.value] : null;
    return raw ? this.client._upsertUser(raw) : null;
  }

  getMember(name) {
    const option = this._typed(name, [ApplicationCommandOptionType.User, ApplicationCommandOptionType.Mentionable], false);
    if (!option || !this._resolved.members || !this._resolved.members[option.value]) return null;

    const raw = { ...this._resolved.members[option.value], user: this._resolved.users[option.value] };
    const guild = this.client.guilds.cache.get(this.guildId);
    return guild ? guild.members._add(raw) : new S.GuildMember(this.client, this.guildId, raw);
  }

  getChannel(name, required = false) {
    const option = this._typed(name, [ApplicationCommandOptionType.Channel], required);
    if (!option) return null;

    const cached = this.client.channels.cache.get(option.value);
    if (cached) return cached;

    const raw = this._resolved.channels ? this._resolved.channels[option.value] : null;
    return raw ? S.createChannel(this.client, { ...raw, guild_id: this.guildId }) : null;
  }

  getRole(name, required = false) {
    const option = this._typed(name, [ApplicationCommandOptionType.Role, ApplicationCommandOptionType.Mentionable], required);
    if (!option) return null;

    const guild = this.client.guilds.cache.get(this.guildId);
    const cached = guild ? guild.roles.cache.get(option.value) : null;
    if (cached) return cached;

    const raw = this._resolved.roles ? this._resolved.roles[option.value] : null;
    return raw ? new S.Role(this.client, raw, guild) : null;
  }

  getMentionable(name, required = false) {
    const option = this._typed(name, [ApplicationCommandOptionType.Mentionable], required);
    if (!option) return null;

    const member = this.getMember(name);
    if (member) return member;

    return this.getUser(name) || this.getRole(name);
  }

  getAttachment(name, required = false) {
    const option = this._typed(name, [ApplicationCommandOptionType.Attachment], required);
    const raw = option && this._resolved.attachments ? this._resolved.attachments[option.value] : null;
    return raw ? new S.Attachment(raw) : null;
  }

  getFocused(getFull = false) {
    const focused = this._hoisted.find((option) => option.focused);
    if (!focused) throw new TypeError("No focused option for autocomplete interaction.");
    return getFull ? focused : focused.value;
  }
}

class ModalSubmitFields {
  constructor(components) {
    this.components = components || [];
    this.fields = new Collection();

    const walk = (items) => {
      for (const item of items || []) {
        if (item.custom_id !== undefined) this.fields.set(item.custom_id, { customId: item.custom_id, type: item.type, value: item.value, values: item.values });
        if (item.components) walk(item.components);
        if (item.component) walk([item.component]);
      }
    };

    walk(this.components);
  }

  getField(customId, type) {
    const field = this.fields.get(customId);
    if (!field) throw new TypeError(`Required field with custom id "${customId}" not found.`);
    if (type !== undefined && field.type !== type) throw new TypeError(`Field "${customId}" is of type ${field.type}, expected ${type}.`);
    return field;
  }

  getTextInputValue(customId) {
    const field = this.getField(customId, ComponentType.TextInput);
    return field.value;
  }

  getStringSelectValues(customId) {
    return this.getField(customId, ComponentType.StringSelect).values || [];
  }
}

class InteractionResponse {
  constructor(interaction) {
    this.client = interaction.client;
    this.interaction = interaction;
  }

  get id() {
    return this.interaction.id;
  }

  fetch() {
    return this.interaction.fetchReply();
  }

  edit(options) {
    return this.interaction.editReply(options);
  }

  delete() {
    return this.interaction.deleteReply();
  }

  createMessageComponentCollector(options = {}) {
    return new InteractionCollector(this.client, { ...options, interactionResponse: this, interactionType: InteractionType.MessageComponent });
  }

  awaitMessageComponent(options = {}) {
    return awaitFirst(this.createMessageComponentCollector({ ...options, max: 1 }));
  }
}

class Interaction {
  constructor(client, data) {
    this.client = client;
    this.id = data.id;
    this.applicationId = data.application_id;
    this.type = data.type;
    this.token = data.token;
    this.version = data.version;
    this.locale = data.locale || null;
    this.guildLocale = data.guild_locale || null;
    this.guildId = data.guild_id || null;
    this.channelId = data.channel_id || (data.channel && data.channel.id) || null;
    this._channelData = data.channel || null;
    this.user = client._upsertUser((data.member && data.member.user) || data.user);
    this.member = null;
    this.appPermissions = data.app_permissions ? new PermissionsBitField(data.app_permissions) : null;
    this.message = data.message ? new S.Message(client, data.message) : null;
    this.deferred = false;
    this.replied = false;
    this.ephemeral = null;

    if (data.member && this.guildId) {
      const guild = client.guilds.cache.get(this.guildId);
      this.member = guild ? guild.members._add(data.member) : new S.GuildMember(client, this.guildId, data.member);
    }

    this.memberPermissions = data.member && data.member.permissions ? new PermissionsBitField(data.member.permissions) : null;

    const info = data.data || {};
    const resolved = info.resolved || {};

    this.commandName = info.name || null;
    this.commandId = info.id || null;
    this.commandType = info.type || null;
    this.commandGuildId = info.guild_id || null;
    this.customId = info.custom_id || null;
    this.componentType = info.component_type || null;
    this.values = info.values || [];
    this.targetId = info.target_id || null;
    this.options = new CommandInteractionOptionResolver(client, info.options, resolved, this.guildId);
    this.fields = new ModalSubmitFields(info.components);

    this._resolved = resolved;

    if (this.componentType >= ComponentType.UserSelect && this.componentType <= ComponentType.ChannelSelect) this._resolveSelectValues(resolved);
  }

  _resolveSelectValues(resolved) {
    const guild = this.client.guilds.cache.get(this.guildId);

    this.users = new Collection();
    this.members = new Collection();
    this.roles = new Collection();
    this.channels = new Collection();

    for (const id of this.values) {
      if (resolved.users && resolved.users[id]) this.users.set(id, this.client._upsertUser(resolved.users[id]));

      if (resolved.members && resolved.members[id] && resolved.users && resolved.users[id]) {
        const raw = { ...resolved.members[id], user: resolved.users[id] };
        this.members.set(id, guild ? guild.members._add(raw) : new S.GuildMember(this.client, this.guildId, raw));
      }

      if (resolved.roles && resolved.roles[id]) this.roles.set(id, (guild && guild.roles.cache.get(id)) || new S.Role(this.client, resolved.roles[id], guild));

      if (resolved.channels && resolved.channels[id]) {
        this.channels.set(id, this.client.channels.cache.get(id) || S.createChannel(this.client, { ...resolved.channels[id], guild_id: this.guildId }));
      }
    }
  }

  get targetUser() {
    if (!this.targetId || !this._resolved.users || !this._resolved.users[this.targetId]) return null;
    return this.client._upsertUser(this._resolved.users[this.targetId]);
  }

  get targetMember() {
    if (!this.targetId || !this._resolved.members || !this._resolved.members[this.targetId]) return null;
    const raw = { ...this._resolved.members[this.targetId], user: this._resolved.users[this.targetId] };
    const guild = this.guild;
    return guild ? guild.members._add(raw) : new S.GuildMember(this.client, this.guildId, raw);
  }

  get targetMessage() {
    if (!this.targetId || !this._resolved.messages || !this._resolved.messages[this.targetId]) return null;
    return new S.Message(this.client, { ...this._resolved.messages[this.targetId], guild_id: this.guildId });
  }

  get createdTimestamp() {
    return SnowflakeUtil.timestampFrom(this.id);
  }

  get guild() {
    return this.guildId ? this.client.guilds.cache.get(this.guildId) || null : null;
  }

  get channel() {
    if (!this.channelId) return null;

    const cached = this.client.channels.cache.get(this.channelId);
    if (cached) return cached;

    const raw = this._channelData || { id: this.channelId, type: this.guildId ? 0 : 1 };
    const channel = S.createChannel(this.client, { ...raw, guild_id: this.guildId });
    this.client.channels.cache.set(channel.id, channel);
    return channel;
  }

  get command() {
    return null;
  }

  inGuild() {
    return Boolean(this.guildId);
  }

  inCachedGuild() {
    return Boolean(this.guild);
  }

  isRepliable() {
    return this.type !== InteractionType.Ping && this.type !== InteractionType.ApplicationCommandAutocomplete;
  }

  isCommand() {
    return this.type === InteractionType.ApplicationCommand;
  }

  isChatInputCommand() {
    return this.isCommand() && this.commandType === ApplicationCommandType.ChatInput;
  }

  isContextMenuCommand() {
    return this.isCommand() && (this.commandType === ApplicationCommandType.User || this.commandType === ApplicationCommandType.Message);
  }

  isUserContextMenuCommand() {
    return this.isCommand() && this.commandType === ApplicationCommandType.User;
  }

  isMessageContextMenuCommand() {
    return this.isCommand() && this.commandType === ApplicationCommandType.Message;
  }

  isAutocomplete() {
    return this.type === InteractionType.ApplicationCommandAutocomplete;
  }

  isModalSubmit() {
    return this.type === InteractionType.ModalSubmit;
  }

  isMessageComponent() {
    return this.type === InteractionType.MessageComponent;
  }

  isButton() {
    return this.isMessageComponent() && this.componentType === ComponentType.Button;
  }

  isStringSelectMenu() {
    return this.isMessageComponent() && this.componentType === ComponentType.StringSelect;
  }

  isUserSelectMenu() {
    return this.isMessageComponent() && this.componentType === ComponentType.UserSelect;
  }

  isRoleSelectMenu() {
    return this.isMessageComponent() && this.componentType === ComponentType.RoleSelect;
  }

  isMentionableSelectMenu() {
    return this.isMessageComponent() && this.componentType === ComponentType.MentionableSelect;
  }

  isChannelSelectMenu() {
    return this.isMessageComponent() && this.componentType === ComponentType.ChannelSelect;
  }

  isAnySelectMenu() {
    return this.isMessageComponent() && this.componentType >= ComponentType.StringSelect && this.componentType <= ComponentType.ChannelSelect && this.componentType !== ComponentType.TextInput;
  }

  isFromMessage() {
    return Boolean(this.message);
  }

  _callback(type, data, extra = {}) {
    const body = data === undefined ? { type } : { type, data };
    return this.client.rest.post(`/interactions/${this.id}/${this.token}/callback`, { body, files: extra.files, query: extra.query, attachmentsKey: "data" });
  }

  _assertFresh() {
    if (this.deferred || this.replied) throw new Error("The reply to this interaction has already been sent or deferred.");
  }

  async reply(options) {
    this._assertFresh();

    const { body, files } = resolveMessagePayload(options, this.client);
    const wantsResponse = Boolean(options && typeof options === "object" && options.withResponse);
    const result = await this._callback(4, body, { files, query: wantsResponse ? { with_response: "true" } : undefined });

    this.ephemeral = Boolean((body.flags || 0) & MessageFlags.Ephemeral);
    this.replied = true;

    if (options && typeof options === "object" && options.fetchReply) return this.fetchReply();

    if (wantsResponse) {
      const raw = result && result.resource && result.resource.message;
      const message = raw ? new S.Message(this.client, raw) : await this.fetchReply();
      return { interaction: this, resource: { message } };
    }

    return new InteractionResponse(this);
  }

  async deferReply(options = {}) {
    this._assertFresh();

    const { body } = resolveMessagePayload({ ephemeral: options.ephemeral, flags: options.flags }, this.client);
    const wantsResponse = Boolean(options.withResponse);
    const result = await this._callback(5, body.flags ? { flags: body.flags } : undefined, { query: wantsResponse ? { with_response: "true" } : undefined });

    this.ephemeral = Boolean((body.flags || 0) & MessageFlags.Ephemeral);
    this.deferred = true;

    if (options.fetchReply) return this.fetchReply();

    if (wantsResponse) {
      const raw = result && result.resource && result.resource.message;
      const message = raw ? new S.Message(this.client, raw) : await this.fetchReply();
      return { interaction: this, resource: { message } };
    }

    return new InteractionResponse(this);
  }

  async deferUpdate(options = {}) {
    this._assertFresh();

    await this._callback(6);
    this.deferred = true;

    if (options.fetchReply) return this.fetchReply();
    return new InteractionResponse(this);
  }

  async update(options) {
    this._assertFresh();

    const { body, files } = resolveMessagePayload(options, this.client);
    await this._callback(7, body, { files });
    this.replied = true;

    if (options && typeof options === "object" && options.fetchReply) return this.fetchReply();
    return new InteractionResponse(this);
  }

  async showModal(modal) {
    this._assertFresh();

    await this._callback(9, modal && typeof modal.toJSON === "function" ? modal.toJSON() : modal);
    this.replied = true;
  }

  async respond(choices) {
    this._assertFresh();

    await this._callback(8, {
      choices: choices.map((choice) => ({ name: choice.name, value: choice.value, name_localizations: choice.nameLocalizations || choice.name_localizations })),
    });
    this.replied = true;
  }

  awaitModalSubmit(options = {}) {
    return awaitFirst(new InteractionCollector(this.client, { ...options, interactionType: InteractionType.ModalSubmit, max: 1 }));
  }

  async editReply(options) {
    if (!this.deferred && !this.replied) throw new Error("The reply to this interaction has not been sent or deferred.");

    const target = options && typeof options === "object" && options.message ? managers.resolveId(options.message) : "@original";
    const { body, files } = resolveMessagePayload(options, this.client);
    const data = await this.client.rest.patch(`/webhooks/${this.applicationId}/${this.token}/messages/${target}`, { body, files });

    this.replied = true;
    return new S.Message(this.client, data || { id: target, channel_id: this.channelId, guild_id: this.guildId });
  }

  async followUp(options) {
    if (!this.deferred && !this.replied) throw new Error("The reply to this interaction has not been sent or deferred.");

    const { body, files } = resolveMessagePayload(options, this.client);
    const data = await this.client.rest.post(`/webhooks/${this.applicationId}/${this.token}`, { body, files, query: { wait: "true" } });

    this.replied = true;
    return new S.Message(this.client, data || { id: "@original", channel_id: this.channelId, guild_id: this.guildId });
  }

  async fetchReply(message = "@original") {
    const data = await this.client.rest.get(`/webhooks/${this.applicationId}/${this.token}/messages/${message}`);
    return new S.Message(this.client, { guild_id: this.guildId, ...data });
  }

  async deleteReply(message = "@original") {
    await this.client.rest.delete(`/webhooks/${this.applicationId}/${this.token}/messages/${managers.resolveId(message)}`);
  }
}

class ChatInputCommandInteraction extends Interaction {}
class UserContextMenuCommandInteraction extends Interaction {}
class MessageContextMenuCommandInteraction extends Interaction {}
class ButtonInteraction extends Interaction {}
class StringSelectMenuInteraction extends Interaction {}
class UserSelectMenuInteraction extends Interaction {}
class RoleSelectMenuInteraction extends Interaction {}
class MentionableSelectMenuInteraction extends Interaction {}
class ChannelSelectMenuInteraction extends Interaction {}
class AutocompleteInteraction extends Interaction {}
class ModalSubmitInteraction extends Interaction {}

function createInteraction(client, data) {
  const info = data.data || {};

  if (data.type === InteractionType.ApplicationCommand && info.type === ApplicationCommandType.User) return new UserContextMenuCommandInteraction(client, data);
  if (data.type === InteractionType.ApplicationCommand && info.type === ApplicationCommandType.Message) return new MessageContextMenuCommandInteraction(client, data);
  if (data.type === InteractionType.ApplicationCommand) return new ChatInputCommandInteraction(client, data);
  if (data.type === InteractionType.ApplicationCommandAutocomplete) return new AutocompleteInteraction(client, data);
  if (data.type === InteractionType.ModalSubmit) return new ModalSubmitInteraction(client, data);

  if (data.type === InteractionType.MessageComponent) {
    if (info.component_type === ComponentType.Button) return new ButtonInteraction(client, data);
    if (info.component_type === ComponentType.StringSelect) return new StringSelectMenuInteraction(client, data);
    if (info.component_type === ComponentType.UserSelect) return new UserSelectMenuInteraction(client, data);
    if (info.component_type === ComponentType.RoleSelect) return new RoleSelectMenuInteraction(client, data);
    if (info.component_type === ComponentType.MentionableSelect) return new MentionableSelectMenuInteraction(client, data);
    if (info.component_type === ComponentType.ChannelSelect) return new ChannelSelectMenuInteraction(client, data);
  }

  return new Interaction(client, data);
}

Object.assign(S, {
  MessageMentions,
  Message,
  ApplicationCommand,
  ClientApplication,
  CommandInteractionOptionResolver,
  ModalSubmitFields,
  InteractionResponse,
  Interaction,
  BaseInteraction: Interaction,
  CommandInteraction: Interaction,
  MessageComponentInteraction: Interaction,
  ChatInputCommandInteraction,
  UserContextMenuCommandInteraction,
  MessageContextMenuCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
  RoleSelectMenuInteraction,
  MentionableSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  AutocompleteInteraction,
  ModalSubmitInteraction,
  createInteraction,
});
