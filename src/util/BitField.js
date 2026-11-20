const { PermissionFlagsBits, GatewayIntentBits, MessageFlags } = require("./constants");

class BitField {
  constructor(bits = this.constructor.DefaultBit) {
    this.bitfield = this.constructor.resolve(bits);
  }

  static resolve(bit) {
    const zero = this.DefaultBit;

    if (typeof bit === "number" && typeof zero === "bigint") bit = BigInt(bit);
    if (typeof bit === "bigint" && typeof zero === "number") bit = Number(bit);
    if (typeof bit === typeof zero && bit >= zero) return bit;
    if (bit instanceof BitField) return bit.bitfield;
    if (Array.isArray(bit)) return bit.map((item) => this.resolve(item)).reduce((a, b) => a | b, zero);

    if (typeof bit === "string") {
      if (this.Flags[bit] !== undefined) return this.Flags[bit];
      if (bit !== "" && !Number.isNaN(Number(bit))) return typeof zero === "bigint" ? BigInt(bit) : Number(bit);
    }

    throw new RangeError(`Invalid bitfield flag or number: ${String(bit)}.`);
  }

  has(bit) {
    bit = this.constructor.resolve(bit);
    return (this.bitfield & bit) === bit;
  }

  any(bit) {
    bit = this.constructor.resolve(bit);
    return (this.bitfield & bit) !== this.constructor.DefaultBit;
  }

  missing(bits) {
    return new this.constructor(bits).remove(this).toArray();
  }

  equals(bit) {
    return this.bitfield === this.constructor.resolve(bit);
  }

  add(...bits) {
    let total = this.constructor.DefaultBit;
    for (const bit of bits) total |= this.constructor.resolve(bit);
    this.bitfield |= total;
    return this;
  }

  remove(...bits) {
    let total = this.constructor.DefaultBit;
    for (const bit of bits) total |= this.constructor.resolve(bit);
    this.bitfield &= ~total;
    return this;
  }

  serialize() {
    const serialized = {};
    for (const [flag, bit] of Object.entries(this.constructor.Flags)) serialized[flag] = this.has(bit);
    return serialized;
  }

  toArray() {
    return Object.keys(this.constructor.Flags).filter((flag) => this.has(flag));
  }

  toJSON() {
    return typeof this.bitfield === "number" ? this.bitfield : this.bitfield.toString();
  }

  valueOf() {
    return this.bitfield;
  }

  [Symbol.iterator]() {
    return this.toArray()[Symbol.iterator]();
  }
}

BitField.Flags = {};
BitField.DefaultBit = 0;

class PermissionsBitField extends BitField {
  has(permission, checkAdmin = true) {
    if (checkAdmin && super.has(PermissionFlagsBits.Administrator)) return true;
    return super.has(permission);
  }

  any(permission, checkAdmin = true) {
    if (checkAdmin && super.has(PermissionFlagsBits.Administrator)) return true;
    return super.any(permission);
  }

  missing(permissions, checkAdmin = true) {
    return checkAdmin && this.has(PermissionFlagsBits.Administrator) ? [] : super.missing(permissions);
  }

  toString() {
    return this.bitfield.toString();
  }
}

PermissionsBitField.Flags = PermissionFlagsBits;
PermissionsBitField.DefaultBit = 0n;
PermissionsBitField.All = Object.values(PermissionFlagsBits).reduce((all, bit) => all | bit, 0n);

class IntentsBitField extends BitField {}

IntentsBitField.Flags = GatewayIntentBits;
IntentsBitField.DefaultBit = 0;

class MessageFlagsBitField extends BitField {}

MessageFlagsBitField.Flags = MessageFlags;
MessageFlagsBitField.DefaultBit = 0;

module.exports = { BitField, PermissionsBitField, IntentsBitField, MessageFlagsBitField };
