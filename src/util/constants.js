const GatewayIntentBits = {
  Guilds: 1 << 0,
  GuildMembers: 1 << 1,
  GuildModeration: 1 << 2,
  GuildExpressions: 1 << 3,
  GuildIntegrations: 1 << 4,
  GuildWebhooks: 1 << 5,
  GuildInvites: 1 << 6,
  GuildVoiceStates: 1 << 7,
  GuildPresences: 1 << 8,
  GuildMessages: 1 << 9,
  GuildMessageReactions: 1 << 10,
  GuildMessageTyping: 1 << 11,
  DirectMessages: 1 << 12,
  DirectMessageReactions: 1 << 13,
  DirectMessageTyping: 1 << 14,
  MessageContent: 1 << 15,
  GuildScheduledEvents: 1 << 16,
  AutoModerationConfiguration: 1 << 20,
  AutoModerationExecution: 1 << 21,
  GuildMessagePolls: 1 << 24,
  DirectMessagePolls: 1 << 25,
};

const Partials = { User: 0, Channel: 1, GuildMember: 2, Message: 3, Reaction: 4, GuildScheduledEvent: 5, ThreadMember: 8 };

const Events = {
  ClientReady: "clientReady",
  Ready: "ready",
  Resumed: "resumed",
  InteractionCreate: "interactionCreate",
  MessageCreate: "messageCreate",
  MessageUpdate: "messageUpdate",
  MessageDelete: "messageDelete",
  MessageBulkDelete: "messageDeleteBulk",
  MessageReactionAdd: "messageReactionAdd",
  MessageReactionRemove: "messageReactionRemove",
  GuildCreate: "guildCreate",
  GuildUpdate: "guildUpdate",
  GuildDelete: "guildDelete",
  GuildMemberAdd: "guildMemberAdd",
  GuildMemberRemove: "guildMemberRemove",
  GuildMemberUpdate: "guildMemberUpdate",
  GuildBanAdd: "guildBanAdd",
  GuildBanRemove: "guildBanRemove",
  GuildRoleCreate: "roleCreate",
  GuildRoleUpdate: "roleUpdate",
  GuildRoleDelete: "roleDelete",
  ChannelCreate: "channelCreate",
  ChannelUpdate: "channelUpdate",
  ChannelDelete: "channelDelete",
  ThreadCreate: "threadCreate",
  ThreadUpdate: "threadUpdate",
  ThreadDelete: "threadDelete",
  VoiceStateUpdate: "voiceStateUpdate",
  PresenceUpdate: "presenceUpdate",
  TypingStart: "typingStart",
  Error: "error",
  Warn: "warn",
  Debug: "debug",
  Raw: "raw",
  RateLimited: "rateLimited",
};

const InteractionType = { Ping: 1, ApplicationCommand: 2, MessageComponent: 3, ApplicationCommandAutocomplete: 4, ModalSubmit: 5 };

const InteractionResponseType = {
  Pong: 1,
  ChannelMessageWithSource: 4,
  DeferredChannelMessageWithSource: 5,
  DeferredMessageUpdate: 6,
  UpdateMessage: 7,
  ApplicationCommandAutocompleteResult: 8,
  Modal: 9,
};

const InteractionContextType = { Guild: 0, BotDM: 1, PrivateChannel: 2 };

const ApplicationIntegrationType = { GuildInstall: 0, UserInstall: 1 };

const ComponentType = {
  ActionRow: 1,
  Button: 2,
  StringSelect: 3,
  TextInput: 4,
  UserSelect: 5,
  RoleSelect: 6,
  MentionableSelect: 7,
  ChannelSelect: 8,
  Section: 9,
  TextDisplay: 10,
  Thumbnail: 11,
  MediaGallery: 12,
  File: 13,
  Separator: 14,
  Container: 17,
  Label: 18,
  FileUpload: 19,
};

const MessageFlags = {
  Crossposted: 1 << 0,
  IsCrosspost: 1 << 1,
  SuppressEmbeds: 1 << 2,
  SourceMessageDeleted: 1 << 3,
  Urgent: 1 << 4,
  HasThread: 1 << 5,
  Ephemeral: 1 << 6,
  Loading: 1 << 7,
  FailedToMentionSomeRolesInThread: 1 << 8,
  SuppressNotifications: 1 << 12,
  IsVoiceMessage: 1 << 13,
  HasSnapshot: 1 << 14,
  IsComponentsV2: 1 << 15,
};

const MessageType = {
  Default: 0,
  RecipientAdd: 1,
  RecipientRemove: 2,
  Call: 3,
  ChannelNameChange: 4,
  ChannelIconChange: 5,
  ChannelPinnedMessage: 6,
  UserJoin: 7,
  GuildBoost: 8,
  ThreadCreated: 18,
  Reply: 19,
  ChatInputCommand: 20,
  ThreadStarterMessage: 21,
  ContextMenuCommand: 23,
};

const ApplicationCommandType = { ChatInput: 1, User: 2, Message: 3 };

const ApplicationCommandOptionType = {
  Subcommand: 1,
  SubcommandGroup: 2,
  String: 3,
  Integer: 4,
  Boolean: 5,
  User: 6,
  Channel: 7,
  Role: 8,
  Mentionable: 9,
  Number: 10,
  Attachment: 11,
};

const ActivityType = { Playing: 0, Streaming: 1, Listening: 2, Watching: 3, Custom: 4, Competing: 5 };

const PresenceUpdateStatus = { Online: "online", Idle: "idle", DoNotDisturb: "dnd", Invisible: "invisible", Offline: "offline" };

const ButtonStyle = { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5, Premium: 6 };

const TextInputStyle = { Short: 1, Paragraph: 2 };

const SeparatorSpacingSize = { Small: 1, Large: 2 };

const ChannelType = {
  GuildText: 0,
  DM: 1,
  GuildVoice: 2,
  GroupDM: 3,
  GuildCategory: 4,
  GuildAnnouncement: 5,
  AnnouncementThread: 10,
  PublicThread: 11,
  PrivateThread: 12,
  GuildStageVoice: 13,
  GuildDirectory: 14,
  GuildForum: 15,
  GuildMedia: 16,
};

const OverwriteType = { Role: 0, Member: 1 };

const AllowedMentionsTypes = { Role: "roles", User: "users", Everyone: "everyone" };

const PermissionFlagsBits = {
  CreateInstantInvite: 1n << 0n,
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  Administrator: 1n << 3n,
  ManageChannels: 1n << 4n,
  ManageGuild: 1n << 5n,
  AddReactions: 1n << 6n,
  ViewAuditLog: 1n << 7n,
  PrioritySpeaker: 1n << 8n,
  Stream: 1n << 9n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  SendTTSMessages: 1n << 12n,
  ManageMessages: 1n << 13n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadMessageHistory: 1n << 16n,
  MentionEveryone: 1n << 17n,
  UseExternalEmojis: 1n << 18n,
  ViewGuildInsights: 1n << 19n,
  Connect: 1n << 20n,
  Speak: 1n << 21n,
  MuteMembers: 1n << 22n,
  DeafenMembers: 1n << 23n,
  MoveMembers: 1n << 24n,
  UseVAD: 1n << 25n,
  ChangeNickname: 1n << 26n,
  ManageNicknames: 1n << 27n,
  ManageRoles: 1n << 28n,
  ManageWebhooks: 1n << 29n,
  ManageGuildExpressions: 1n << 30n,
  UseApplicationCommands: 1n << 31n,
  RequestToSpeak: 1n << 32n,
  ManageEvents: 1n << 33n,
  ManageThreads: 1n << 34n,
  CreatePublicThreads: 1n << 35n,
  CreatePrivateThreads: 1n << 36n,
  UseExternalStickers: 1n << 37n,
  SendMessagesInThreads: 1n << 38n,
  UseEmbeddedActivities: 1n << 39n,
  ModerateMembers: 1n << 40n,
  ViewCreatorMonetizationAnalytics: 1n << 41n,
  UseSoundboard: 1n << 42n,
  CreateGuildExpressions: 1n << 43n,
  CreateEvents: 1n << 44n,
  UseExternalSounds: 1n << 45n,
  SendVoiceMessages: 1n << 46n,
  SendPolls: 1n << 49n,
  UseExternalApps: 1n << 50n,
};

const Colors = {
  Default: 0x000000,
  White: 0xffffff,
  Aqua: 0x1abc9c,
  Green: 0x57f287,
  Blue: 0x3498db,
  Yellow: 0xfee75c,
  Purple: 0x9b59b6,
  LuminousVividPink: 0xe91e63,
  Fuchsia: 0xeb459e,
  Gold: 0xf1c40f,
  Orange: 0xe67e22,
  Red: 0xed4245,
  Grey: 0x95a5a6,
  Navy: 0x34495e,
  DarkAqua: 0x11806a,
  DarkGreen: 0x1f8b4c,
  DarkBlue: 0x206694,
  DarkPurple: 0x71368a,
  DarkVividPink: 0xad1457,
  DarkGold: 0xc27c0e,
  DarkOrange: 0xa84300,
  DarkRed: 0x992d22,
  DarkGrey: 0x979c9f,
  DarkerGrey: 0x7f8c8d,
  LightGrey: 0xbcc0c0,
  DarkNavy: 0x2c3e50,
  Blurple: 0x5865f2,
  Greyple: 0x99aab5,
  DarkButNotBlack: 0x2c2f33,
  NotQuiteBlack: 0x23272a,
};

const TimestampStyles = {
  ShortTime: "t",
  LongTime: "T",
  ShortDate: "d",
  LongDate: "D",
  ShortDateTime: "f",
  LongDateTime: "F",
  RelativeTime: "R",
};

module.exports = {
  GatewayIntentBits,
  Partials,
  Events,
  InteractionType,
  InteractionResponseType,
  InteractionContextType,
  ApplicationIntegrationType,
  ComponentType,
  MessageFlags,
  MessageType,
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActivityType,
  PresenceUpdateStatus,
  ButtonStyle,
  TextInputStyle,
  SeparatorSpacingSize,
  ChannelType,
  OverwriteType,
  AllowedMentionsTypes,
  PermissionFlagsBits,
  Colors,
  TimestampStyles,
};
