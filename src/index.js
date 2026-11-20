const pkg = require("../package.json");
const Client = require("./client/Client");
const WebhookClient = require("./client/WebhookClient");
const Collection = require("./util/Collection");
const constants = require("./util/constants");
const formatters = require("./util/formatters");
const { BitField, PermissionsBitField, IntentsBitField, MessageFlagsBitField } = require("./util/BitField");
const { SnowflakeUtil, resolveColor } = require("./util/Util");
const { REST, ByacordAPIError, HTTPError } = require("./rest/REST");
const components = require("./builders/components");
const slash = require("./builders/SlashCommandBuilder");
const EmbedBuilder = require("./builders/EmbedBuilder");
const AttachmentBuilder = require("./builders/AttachmentBuilder");
const structures = require("./structures");
const { Collector, InteractionCollector, MessageCollector } = require("./structures/Collectors");
const managers = require("./managers");

const { createChannel, createInteraction, imageURL, toDataURI, ...publicStructures } = structures;
const { resolveId, commandToJSON, ...publicManagers } = managers;
const { ComponentBuilder, ...publicComponents } = components;

module.exports = {
  Client,
  WebhookClient,
  Collection,
  REST,
  ByacordAPIError,
  DiscordAPIError: ByacordAPIError,
  HTTPError,
  BitField,
  PermissionsBitField,
  IntentsBitField,
  MessageFlagsBitField,
  SnowflakeUtil,
  resolveColor,
  Collector,
  InteractionCollector,
  MessageCollector,
  EmbedBuilder,
  AttachmentBuilder,
  ...constants,
  ...formatters,
  ...slash,
  ...publicComponents,
  ...publicStructures,
  ...publicManagers,
  version: pkg.version,
};
