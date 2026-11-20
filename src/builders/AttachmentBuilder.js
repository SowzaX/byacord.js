class AttachmentBuilder {
  constructor(attachment, data = {}) {
    this.attachment = attachment;
    this.name = data.name;
    this.description = data.description;
  }

  setName(name) {
    this.name = name;
    return this;
  }

  setDescription(description) {
    this.description = description;
    return this;
  }

  setFile(attachment, name) {
    this.attachment = attachment;
    if (name) this.name = name;
    return this;
  }

  setSpoiler(spoiler = true) {
    const plain = (this.name || "").replace(/^SPOILER_/, "");
    this.name = spoiler ? `SPOILER_${plain}` : plain;
    return this;
  }

  get spoiler() {
    return (this.name || "").startsWith("SPOILER_");
  }

  toJSON() {
    return { attachment: this.attachment, name: this.name, description: this.description };
  }
}

module.exports = AttachmentBuilder;
