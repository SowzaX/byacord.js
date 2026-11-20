const { ComponentType, ButtonStyle } = require("../util/constants");
const { resolveColor, parseEmoji } = require("../util/Util");

function json(item) {
  return item && typeof item.toJSON === "function" ? item.toJSON() : item;
}

function resolveInput(Builder, input) {
  if (typeof input !== "function") return input;
  const builder = new Builder();
  input(builder);
  return builder;
}

class ComponentBuilder {
  constructor(data = {}) {
    this.data = { ...data };
  }

  static from(other) {
    return new this(json(other));
  }

  setId(id) {
    this.data.id = id;
    return this;
  }

  clearId() {
    delete this.data.id;
    return this;
  }

  toJSON() {
    return { ...this.data };
  }
}

/* ---------- Components V2 ---------- */

class TextDisplayBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.TextDisplay, ...data });
  }

  setContent(content) {
    this.data.content = content;
    return this;
  }
}

class SeparatorBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.Separator, divider: true, spacing: 1, ...data });
  }

  setDivider(divider = true) {
    this.data.divider = divider;
    return this;
  }

  setSpacing(spacing) {
    if (spacing === "Small") spacing = 1;
    if (spacing === "Large") spacing = 2;
    this.data.spacing = spacing;
    return this;
  }
}

class ThumbnailBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.Thumbnail, ...data });
  }

  setURL(url) {
    this.data.media = { url };
    return this;
  }

  setDescription(description) {
    this.data.description = description;
    return this;
  }

  setSpoiler(spoiler = true) {
    this.data.spoiler = spoiler;
    return this;
  }
}

class MediaGalleryItemBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ ...data });
  }

  setURL(url) {
    this.data.media = { url };
    return this;
  }

  setDescription(description) {
    this.data.description = description;
    return this;
  }

  setSpoiler(spoiler = true) {
    this.data.spoiler = spoiler;
    return this;
  }
}

class MediaGalleryBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.MediaGallery, items: [], ...data });
  }

  addItems(...items) {
    this.data.items.push(...items.flat(Infinity).map((item) => resolveInput(MediaGalleryItemBuilder, item)));
    return this;
  }

  setItems(...items) {
    this.data.items = [];
    return this.addItems(...items);
  }

  spliceItems(index, deleteCount, ...items) {
    this.data.items.splice(index, deleteCount, ...items.flat(Infinity).map((item) => resolveInput(MediaGalleryItemBuilder, item)));
    return this;
  }

  toJSON() {
    return { ...this.data, items: this.data.items.map(json) };
  }
}

class FileBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.File, ...data });
  }

  setURL(url) {
    this.data.file = { url };
    return this;
  }

  setSpoiler(spoiler = true) {
    this.data.spoiler = spoiler;
    return this;
  }
}

/* ---------- Interativos ---------- */

class ButtonBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.Button, ...data });
    if (data.emoji) this.data.emoji = parseEmoji(data.emoji);
  }

  setCustomId(customId) {
    this.data.custom_id = customId;
    return this;
  }

  setLabel(label) {
    this.data.label = label;
    return this;
  }

  setStyle(style) {
    this.data.style = typeof style === "string" ? ButtonStyle[style] : style;
    return this;
  }

  setURL(url) {
    this.data.url = url;
    this.data.style = ButtonStyle.Link;
    return this;
  }

  setEmoji(emoji) {
    this.data.emoji = parseEmoji(emoji);
    return this;
  }

  setDisabled(disabled = true) {
    this.data.disabled = disabled;
    return this;
  }

  setSKUId(skuId) {
    this.data.sku_id = skuId;
    this.data.style = ButtonStyle.Premium;
    return this;
  }

  toJSON() {
    const data = { ...this.data };
    if (data.style === undefined) throw new RangeError("Button needs a style (setStyle).");
    if (data.style === ButtonStyle.Link && !data.url) throw new RangeError("Link buttons need a URL (setURL).");
    if (data.style !== ButtonStyle.Link && data.style !== ButtonStyle.Premium && !data.custom_id) throw new RangeError("Buttons need a custom id (setCustomId) unless they are link buttons.");
    return data;
  }
}

class StringSelectMenuOptionBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ ...data });
    if (data.emoji) this.data.emoji = parseEmoji(data.emoji);
  }

  setLabel(label) {
    this.data.label = label;
    return this;
  }

  setValue(value) {
    this.data.value = value;
    return this;
  }

  setDescription(description) {
    this.data.description = description;
    return this;
  }

  setEmoji(emoji) {
    this.data.emoji = parseEmoji(emoji);
    return this;
  }

  setDefault(isDefault = true) {
    this.data.default = isDefault;
    return this;
  }
}

class BaseSelectMenuBuilder extends ComponentBuilder {
  setCustomId(customId) {
    this.data.custom_id = customId;
    return this;
  }

  setPlaceholder(placeholder) {
    this.data.placeholder = placeholder;
    return this;
  }

  setMinValues(min) {
    this.data.min_values = min;
    return this;
  }

  setMaxValues(max) {
    this.data.max_values = max;
    return this;
  }

  setDisabled(disabled = true) {
    this.data.disabled = disabled;
    return this;
  }

  setRequired(required = true) {
    this.data.required = required;
    return this;
  }

  toJSON() {
    const data = { ...this.data };
    if (!data.custom_id) throw new RangeError("Select menus need a custom id (setCustomId).");
    return data;
  }
}

class StringSelectMenuBuilder extends BaseSelectMenuBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.StringSelect, options: [], ...data });
  }

  addOptions(...options) {
    const list = options.flat(Infinity).map((option) => resolveInput(StringSelectMenuOptionBuilder, option));
    if (this.data.options.length + list.length > 25) throw new RangeError("Select menus can have at most 25 options.");
    this.data.options.push(...list);
    return this;
  }

  setOptions(...options) {
    this.data.options = [];
    return this.addOptions(...options);
  }

  spliceOptions(index, deleteCount, ...options) {
    this.data.options.splice(index, deleteCount, ...options.flat(Infinity).map((option) => resolveInput(StringSelectMenuOptionBuilder, option)));
    return this;
  }

  toJSON() {
    const data = super.toJSON();
    data.options = this.data.options.map(json);
    if (!data.options.length) throw new RangeError("String select menus need at least one option.");
    return data;
  }
}

class UserSelectMenuBuilder extends BaseSelectMenuBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.UserSelect, ...data });
  }

  setDefaultUsers(...ids) {
    this.data.default_values = ids.flat().map((id) => ({ id, type: "user" }));
    return this;
  }
}

class RoleSelectMenuBuilder extends BaseSelectMenuBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.RoleSelect, ...data });
  }

  setDefaultRoles(...ids) {
    this.data.default_values = ids.flat().map((id) => ({ id, type: "role" }));
    return this;
  }
}

class MentionableSelectMenuBuilder extends BaseSelectMenuBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.MentionableSelect, ...data });
  }

  setDefaultValues(...values) {
    this.data.default_values = values.flat();
    return this;
  }
}

class ChannelSelectMenuBuilder extends BaseSelectMenuBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.ChannelSelect, ...data });
  }

  setChannelTypes(...types) {
    this.data.channel_types = types.flat();
    return this;
  }

  addChannelTypes(...types) {
    this.data.channel_types = (this.data.channel_types || []).concat(types.flat());
    return this;
  }

  setDefaultChannels(...ids) {
    this.data.default_values = ids.flat().map((id) => ({ id, type: "channel" }));
    return this;
  }
}

class TextInputBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.TextInput, ...data });
  }

  setCustomId(customId) {
    this.data.custom_id = customId;
    return this;
  }

  setLabel(label) {
    this.data.label = label;
    return this;
  }

  setStyle(style) {
    this.data.style = typeof style === "string" ? { Short: 1, Paragraph: 2 }[style] : style;
    return this;
  }

  setPlaceholder(placeholder) {
    this.data.placeholder = placeholder;
    return this;
  }

  setRequired(required = true) {
    this.data.required = required;
    return this;
  }

  setMinLength(min) {
    this.data.min_length = min;
    return this;
  }

  setMaxLength(max) {
    this.data.max_length = max;
    return this;
  }

  setValue(value) {
    this.data.value = value;
    return this;
  }

  toJSON() {
    const data = { ...this.data };
    if (!data.custom_id) throw new RangeError("Text inputs need a custom id (setCustomId).");
    if (data.style === undefined) data.style = 1;
    return data;
  }
}

class ActionRowBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.ActionRow, components: [], ...data });
  }

  addComponents(...components) {
    this.data.components.push(...components.flat(Infinity));
    return this;
  }

  setComponents(...components) {
    this.data.components = components.flat(Infinity);
    return this;
  }

  spliceComponents(index, deleteCount, ...components) {
    this.data.components.splice(index, deleteCount, ...components.flat(Infinity));
    return this;
  }

  toJSON() {
    return { ...this.data, components: this.data.components.map(json) };
  }
}

class LabelBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.Label, ...data });
  }

  setLabel(label) {
    this.data.label = label;
    return this;
  }

  setDescription(description) {
    this.data.description = description;
    return this;
  }

  setTextInputComponent(input) {
    this.data.component = resolveInput(TextInputBuilder, input);
    return this;
  }

  setStringSelectMenuComponent(input) {
    this.data.component = resolveInput(StringSelectMenuBuilder, input);
    return this;
  }

  setUserSelectMenuComponent(input) {
    this.data.component = resolveInput(UserSelectMenuBuilder, input);
    return this;
  }

  setRoleSelectMenuComponent(input) {
    this.data.component = resolveInput(RoleSelectMenuBuilder, input);
    return this;
  }

  setMentionableSelectMenuComponent(input) {
    this.data.component = resolveInput(MentionableSelectMenuBuilder, input);
    return this;
  }

  setChannelSelectMenuComponent(input) {
    this.data.component = resolveInput(ChannelSelectMenuBuilder, input);
    return this;
  }

  toJSON() {
    return { ...this.data, component: json(this.data.component) };
  }
}

class ModalBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ components: [], ...data });
  }

  setCustomId(customId) {
    this.data.custom_id = customId;
    return this;
  }

  setTitle(title) {
    this.data.title = title;
    return this;
  }

  addComponents(...components) {
    this.data.components.push(...components.flat(Infinity));
    return this;
  }

  setComponents(...components) {
    this.data.components = components.flat(Infinity);
    return this;
  }

  addLabelComponents(...components) {
    this.data.components.push(...components.flat(Infinity).map((item) => resolveInput(LabelBuilder, item)));
    return this;
  }

  toJSON() {
    const data = { ...this.data };
    if (!data.custom_id) throw new RangeError("Modals need a custom id (setCustomId).");
    if (!data.title) throw new RangeError("Modals need a title (setTitle).");

    data.components = this.data.components.map((component) => {
      const raw = json(component);
      if (raw && raw.type === ComponentType.TextInput) return { type: ComponentType.ActionRow, components: [raw] };
      return raw;
    });

    return data;
  }
}

class SectionBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.Section, components: [], ...data });
  }

  addTextDisplayComponents(...components) {
    const list = components.flat(Infinity).map((item) => resolveInput(TextDisplayBuilder, item));
    if (this.data.components.length + list.length > 3) throw new RangeError("Sections can have at most 3 text displays.");
    this.data.components.push(...list);
    return this;
  }

  setTextDisplayComponents(...components) {
    this.data.components = [];
    return this.addTextDisplayComponents(...components);
  }

  spliceTextDisplayComponents(index, deleteCount, ...components) {
    this.data.components.splice(index, deleteCount, ...components.flat(Infinity).map((item) => resolveInput(TextDisplayBuilder, item)));
    return this;
  }

  setButtonAccessory(button) {
    this.data.accessory = resolveInput(ButtonBuilder, button);
    return this;
  }

  setThumbnailAccessory(thumbnail) {
    this.data.accessory = resolveInput(ThumbnailBuilder, thumbnail);
    return this;
  }

  toJSON() {
    const data = { ...this.data, components: this.data.components.map(json), accessory: json(this.data.accessory) };
    if (!data.accessory) throw new RangeError("Sections need an accessory (setButtonAccessory or setThumbnailAccessory).");
    if (!data.components.length) throw new RangeError("Sections need at least one text display.");
    return data;
  }
}

class ContainerBuilder extends ComponentBuilder {
  constructor(data = {}) {
    super({ type: ComponentType.Container, components: [], ...data });
  }

  addComponents(...components) {
    this.data.components.push(...components.flat(Infinity));
    return this;
  }

  addTextDisplayComponents(...components) {
    return this.addComponents(components.flat(Infinity).map((item) => resolveInput(TextDisplayBuilder, item)));
  }

  addSeparatorComponents(...components) {
    return this.addComponents(components.flat(Infinity).map((item) => resolveInput(SeparatorBuilder, item)));
  }

  addSectionComponents(...components) {
    return this.addComponents(components.flat(Infinity).map((item) => resolveInput(SectionBuilder, item)));
  }

  addActionRowComponents(...components) {
    return this.addComponents(components.flat(Infinity).map((item) => resolveInput(ActionRowBuilder, item)));
  }

  addMediaGalleryComponents(...components) {
    return this.addComponents(components.flat(Infinity).map((item) => resolveInput(MediaGalleryBuilder, item)));
  }

  addFileComponents(...components) {
    return this.addComponents(components.flat(Infinity).map((item) => resolveInput(FileBuilder, item)));
  }

  spliceComponents(index, deleteCount, ...components) {
    this.data.components.splice(index, deleteCount, ...components.flat(Infinity));
    return this;
  }

  setAccentColor(color) {
    this.data.accent_color = resolveColor(color);
    return this;
  }

  clearAccentColor() {
    delete this.data.accent_color;
    return this;
  }

  setSpoiler(spoiler = true) {
    this.data.spoiler = spoiler;
    return this;
  }

  toJSON() {
    return { ...this.data, components: this.data.components.map(json) };
  }
}

module.exports = {
  ComponentBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  FileBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  TextInputBuilder,
  ActionRowBuilder,
  LabelBuilder,
  ModalBuilder,
  SectionBuilder,
  ContainerBuilder,
};
