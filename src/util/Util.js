const { Colors } = require("./constants");

const EPOCH = 1420070400000n;

const SnowflakeUtil = {
  // TODO: confirmar se a Byacord usa o mesmo epoch do Discord (2015-01-01)
  EPOCH,

  deconstruct(id) {
    const value = BigInt(id);
    return {
      timestamp: Number((value >> 22n) + EPOCH),
      workerId: Number((value >> 17n) & 31n),
      processId: Number((value >> 12n) & 31n),
      increment: Number(value & 4095n),
    };
  },

  timestampFrom(id) {
    if (!/^\d+$/.test(String(id))) return 0;
    return Number((BigInt(id) >> 22n) + EPOCH);
  },
};

function resolveColor(color) {
  if (typeof color === "number") return color;
  if (Array.isArray(color)) return (color[0] << 16) + (color[1] << 8) + color[2];

  if (typeof color === "string") {
    if (color === "Random") return Math.floor(Math.random() * (0xffffff + 1));
    if (Colors[color] !== undefined) return Colors[color];

    const parsed = parseInt(color.replace("#", ""), 16);
    if (!Number.isNaN(parsed)) return parsed;
  }

  throw new TypeError(`Unable to resolve color: ${String(color)}`);
}

function resolveEmojiIdentifier(emoji) {
  if (!emoji) return null;
  if (typeof emoji === "object") return emoji.id ? `${emoji.name || "_"}:${emoji.id}` : emoji.name;

  const custom = /^<a?:([^:]+):(\d+)>$/.exec(emoji);
  if (custom) return `${custom[1]}:${custom[2]}`;

  return emoji;
}

function parseEmoji(emoji) {
  if (!emoji) return undefined;
  if (typeof emoji === "object") return emoji;

  const custom = /^<(a?):([^:]+):(\d+)>$/.exec(emoji);
  if (custom) return { id: custom[3], name: custom[2], animated: custom[1] === "a" };
  if (/^\d+$/.test(emoji)) return { id: emoji };

  return { name: emoji };
}

module.exports = { SnowflakeUtil, resolveColor, resolveEmojiIdentifier, parseEmoji };
