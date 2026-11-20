const { resolveColor } = require("../util/Util");

class EmbedBuilder {
  constructor(data = {}) {
    this.data = { ...data };
    if (data.fields) this.data.fields = data.fields.map((field) => ({ ...field }));
    if (data.timestamp instanceof Date) this.data.timestamp = data.timestamp.toISOString();
  }

  static from(other) {
    return new EmbedBuilder(other.toJSON ? other.toJSON() : other);
  }

  setAuthor(options) {
    if (options === null) {
      delete this.data.author;
      return this;
    }

    this.data.author = { name: options.name, url: options.url, icon_url: options.iconURL };
    return this;
  }

  setColor(color) {
    if (color === null) {
      delete this.data.color;
      return this;
    }

    this.data.color = resolveColor(color);
    return this;
  }

  setDescription(description) {
    if (description === null) delete this.data.description;
    if (description !== null) this.data.description = description;
    return this;
  }

  setFooter(options) {
    if (options === null) {
      delete this.data.footer;
      return this;
    }

    this.data.footer = { text: options.text, icon_url: options.iconURL };
    return this;
  }

  setImage(url) {
    if (url === null) delete this.data.image;
    if (url !== null) this.data.image = { url };
    return this;
  }

  setThumbnail(url) {
    if (url === null) delete this.data.thumbnail;
    if (url !== null) this.data.thumbnail = { url };
    return this;
  }

  setTimestamp(timestamp = Date.now()) {
    if (timestamp === null) delete this.data.timestamp;
    if (timestamp !== null) this.data.timestamp = new Date(timestamp).toISOString();
    return this;
  }

  setTitle(title) {
    if (title === null) delete this.data.title;
    if (title !== null) this.data.title = title;
    return this;
  }

  setURL(url) {
    if (url === null) delete this.data.url;
    if (url !== null) this.data.url = url;
    return this;
  }

  addFields(...fields) {
    const list = fields.flat(Infinity);
    if (!this.data.fields) this.data.fields = [];
    if (this.data.fields.length + list.length > 25) throw new RangeError("Embeds can have at most 25 fields.");
    this.data.fields.push(...list.map((field) => ({ name: field.name, value: field.value, inline: field.inline })));
    return this;
  }

  spliceFields(index, deleteCount, ...fields) {
    if (!this.data.fields) this.data.fields = [];
    this.data.fields.splice(index, deleteCount, ...fields.flat(Infinity));
    return this;
  }

  setFields(...fields) {
    this.data.fields = [];
    return this.addFields(...fields);
  }

  toJSON() {
    return { ...this.data };
  }
}

module.exports = EmbedBuilder;
