const { MessageFlags } = require("../util/constants");
const { MessageFlagsBitField } = require("../util/BitField");

const V2_TYPES = new Set([9, 10, 11, 12, 13, 14, 17]);

function toRaw(item) {
  return item && typeof item.toJSON === "function" ? item.toJSON() : item;
}

function resolveMessagePayload(options, client) {
  const input = typeof options === "string" ? { content: options } : { ...(options || {}) };
  const body = {};
  let flags = input.flags === undefined ? 0 : Number(new MessageFlagsBitField(input.flags).bitfield);

  if (input.content !== undefined) body.content = input.content;
  if (input.tts !== undefined) body.tts = input.tts;
  if (input.nonce !== undefined) body.nonce = input.nonce;
  if (input.enforceNonce !== undefined) body.enforce_nonce = input.enforceNonce;
  if (input.stickers !== undefined) body.sticker_ids = input.stickers.map((sticker) => sticker.id || sticker);
  if (input.poll !== undefined) body.poll = toRaw(input.poll);
  if (input.attachments !== undefined) body.attachments = input.attachments.map(toRaw);
  if (input.embeds !== undefined) body.embeds = input.embeds.map(toRaw);
  if (input.components !== undefined) body.components = input.components.map(toRaw);

  const mentions = input.allowedMentions !== undefined ? input.allowedMentions : client && client.options.allowedMentions;
  if (mentions) body.allowed_mentions = { parse: mentions.parse, roles: mentions.roles, users: mentions.users, replied_user: mentions.repliedUser };

  if (input.reply) {
    const reference = input.reply.messageReference;
    body.message_reference = {
      message_id: reference && reference.id ? reference.id : reference,
      fail_if_not_exists: input.reply.failIfNotExists === undefined ? false : input.reply.failIfNotExists,
    };
  }

  if (input.ephemeral) flags |= MessageFlags.Ephemeral;
  if (input.suppressEmbeds) flags |= MessageFlags.SuppressEmbeds;
  if (input.silent) flags |= MessageFlags.SuppressNotifications;

  if (body.components && body.components.some((component) => component && V2_TYPES.has(component.type))) flags |= MessageFlags.IsComponentsV2;

  if (flags) body.flags = flags;

  const files = input.files ? input.files.map((file) => (file && typeof file.toJSON === "function" && file.attachment === undefined ? file.toJSON() : file)) : undefined;

  return { body, files };
}

module.exports = { resolveMessagePayload, toRaw };
