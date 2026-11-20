const { ApplicationCommandOptionType, ApplicationCommandType } = require("../util/constants");
const { PermissionsBitField } = require("../util/BitField");

const NAME_REGEX = /^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

function validateName(name, kind) {
  if (typeof name !== "string" || !NAME_REGEX.test(name) || name !== name.toLowerCase()) {
    throw new RangeError(`Invalid ${kind} name "${name}": use 1-32 lowercase letters, numbers, "-" or "_".`);
  }
}

function validateDescription(description, kind) {
  if (typeof description !== "string" || description.length < 1 || description.length > 100) {
    throw new RangeError(`Invalid ${kind} description: it must have between 1 and 100 characters.`);
  }
}

function validateOptions(options) {
  if (options.length > 25) throw new RangeError("Commands can have at most 25 options.");

  let optionalFound = false;

  for (const option of options) {
    if (option.required && optionalFound) throw new RangeError("Required options must be placed before non-required options.");
    if (!option.required) optionalFound = true;
  }
}

class BaseOption {
  constructor(type) {
    this.type = type;
    this.name = "";
    this.description = "";
    this.required = false;
  }

  setName(name) {
    this.name = name;
    return this;
  }

  setDescription(description) {
    this.description = description;
    return this;
  }

  setRequired(required = true) {
    this.required = required;
    return this;
  }

  setNameLocalizations(localizations) {
    this.name_localizations = localizations;
    return this;
  }

  setDescriptionLocalizations(localizations) {
    this.description_localizations = localizations;
    return this;
  }

  toJSON() {
    validateName(this.name, "option");
    validateDescription(this.description, "option");

    const data = {
      type: this.type,
      name: this.name,
      description: this.description,
      required: this.required,
      name_localizations: this.name_localizations,
      description_localizations: this.description_localizations,
    };

    if (this.choices !== undefined) data.choices = this.choices;
    if (this.autocomplete !== undefined) data.autocomplete = this.autocomplete;
    if (this.min_value !== undefined) data.min_value = this.min_value;
    if (this.max_value !== undefined) data.max_value = this.max_value;
    if (this.min_length !== undefined) data.min_length = this.min_length;
    if (this.max_length !== undefined) data.max_length = this.max_length;
    if (this.channel_types !== undefined) data.channel_types = this.channel_types;

    return data;
  }
}

function withChoices(Base) {
  return class extends Base {
    addChoices(...choices) {
      const list = choices.flat(Infinity);
      if (this.autocomplete) throw new RangeError("Autocomplete and choices are mutually exclusive.");
      if ((this.choices || []).length + list.length > 25) throw new RangeError("Options can have at most 25 choices.");
      this.choices = (this.choices || []).concat(list.map((choice) => ({ name: choice.name, value: choice.value, name_localizations: choice.name_localizations || choice.nameLocalizations })));
      return this;
    }

    setChoices(...choices) {
      this.choices = [];
      return this.addChoices(...choices);
    }

    setAutocomplete(autocomplete = true) {
      if (autocomplete && this.choices && this.choices.length) throw new RangeError("Autocomplete and choices are mutually exclusive.");
      this.autocomplete = autocomplete;
      return this;
    }
  };
}

class SlashCommandStringOption extends withChoices(BaseOption) {
  constructor() {
    super(ApplicationCommandOptionType.String);
  }

  setMinLength(min) {
    this.min_length = min;
    return this;
  }

  setMaxLength(max) {
    this.max_length = max;
    return this;
  }
}

class SlashCommandIntegerOption extends withChoices(BaseOption) {
  constructor() {
    super(ApplicationCommandOptionType.Integer);
  }

  setMinValue(min) {
    this.min_value = min;
    return this;
  }

  setMaxValue(max) {
    this.max_value = max;
    return this;
  }
}

class SlashCommandNumberOption extends withChoices(BaseOption) {
  constructor() {
    super(ApplicationCommandOptionType.Number);
  }

  setMinValue(min) {
    this.min_value = min;
    return this;
  }

  setMaxValue(max) {
    this.max_value = max;
    return this;
  }
}

class SlashCommandBooleanOption extends BaseOption {
  constructor() {
    super(ApplicationCommandOptionType.Boolean);
  }
}

class SlashCommandUserOption extends BaseOption {
  constructor() {
    super(ApplicationCommandOptionType.User);
  }
}

class SlashCommandRoleOption extends BaseOption {
  constructor() {
    super(ApplicationCommandOptionType.Role);
  }
}

class SlashCommandMentionableOption extends BaseOption {
  constructor() {
    super(ApplicationCommandOptionType.Mentionable);
  }
}

class SlashCommandAttachmentOption extends BaseOption {
  constructor() {
    super(ApplicationCommandOptionType.Attachment);
  }
}

class SlashCommandChannelOption extends BaseOption {
  constructor() {
    super(ApplicationCommandOptionType.Channel);
  }

  addChannelTypes(...types) {
    this.channel_types = (this.channel_types || []).concat(types.flat());
    return this;
  }
}

const OPTION_ADDERS = {
  addStringOption: SlashCommandStringOption,
  addIntegerOption: SlashCommandIntegerOption,
  addNumberOption: SlashCommandNumberOption,
  addBooleanOption: SlashCommandBooleanOption,
  addUserOption: SlashCommandUserOption,
  addChannelOption: SlashCommandChannelOption,
  addRoleOption: SlashCommandRoleOption,
  addMentionableOption: SlashCommandMentionableOption,
  addAttachmentOption: SlashCommandAttachmentOption,
};

class SharedOptions {
  constructor() {
    this.options = [];
  }

  addOption(input, Builder) {
    const option = typeof input === "function" ? input(new Builder()) : input;
    this.options.push(option || input);
    return this;
  }
}

for (const [method, Builder] of Object.entries(OPTION_ADDERS)) {
  SharedOptions.prototype[method] = function (input) {
    const instance = new Builder();
    const result = typeof input === "function" ? input(instance) : input;
    this.options.push(result || instance);
    return this;
  };
}

class SlashCommandSubcommandBuilder extends SharedOptions {
  constructor() {
    super();
    this.type = ApplicationCommandOptionType.Subcommand;
    this.name = "";
    this.description = "";
  }

  setName(name) {
    this.name = name;
    return this;
  }

  setDescription(description) {
    this.description = description;
    return this;
  }

  setNameLocalizations(localizations) {
    this.name_localizations = localizations;
    return this;
  }

  setDescriptionLocalizations(localizations) {
    this.description_localizations = localizations;
    return this;
  }

  toJSON() {
    validateName(this.name, "subcommand");
    validateDescription(this.description, "subcommand");

    const options = this.options.map((option) => (option.toJSON ? option.toJSON() : option));
    validateOptions(options);

    return {
      type: this.type,
      name: this.name,
      description: this.description,
      name_localizations: this.name_localizations,
      description_localizations: this.description_localizations,
      options,
    };
  }
}

class SlashCommandSubcommandGroupBuilder {
  constructor() {
    this.type = ApplicationCommandOptionType.SubcommandGroup;
    this.name = "";
    this.description = "";
    this.options = [];
  }

  setName(name) {
    this.name = name;
    return this;
  }

  setDescription(description) {
    this.description = description;
    return this;
  }

  setNameLocalizations(localizations) {
    this.name_localizations = localizations;
    return this;
  }

  setDescriptionLocalizations(localizations) {
    this.description_localizations = localizations;
    return this;
  }

  addSubcommand(input) {
    const instance = new SlashCommandSubcommandBuilder();
    const result = typeof input === "function" ? input(instance) : input;
    this.options.push(result || instance);
    return this;
  }

  toJSON() {
    validateName(this.name, "subcommand group");
    validateDescription(this.description, "subcommand group");

    return {
      type: this.type,
      name: this.name,
      description: this.description,
      name_localizations: this.name_localizations,
      description_localizations: this.description_localizations,
      options: this.options.map((option) => (option.toJSON ? option.toJSON() : option)),
    };
  }
}

class SlashCommandBuilder extends SharedOptions {
  constructor() {
    super();
    this.name = "";
    this.description = "";
    this.default_member_permissions = undefined;
    this.dm_permission = undefined;
    this.nsfw = undefined;
  }

  setName(name) {
    this.name = name;
    return this;
  }

  setDescription(description) {
    this.description = description;
    return this;
  }

  setNameLocalizations(localizations) {
    this.name_localizations = localizations;
    return this;
  }

  setDescriptionLocalizations(localizations) {
    this.description_localizations = localizations;
    return this;
  }

  setDefaultMemberPermissions(permissions) {
    this.default_member_permissions = permissions === null || permissions === undefined ? null : PermissionsBitField.resolve(permissions).toString();
    return this;
  }

  setDMPermission(enabled = true) {
    this.dm_permission = enabled;
    return this;
  }

  setNSFW(nsfw = true) {
    this.nsfw = nsfw;
    return this;
  }

  setContexts(...contexts) {
    this.contexts = contexts.flat();
    return this;
  }

  setIntegrationTypes(...types) {
    this.integration_types = types.flat();
    return this;
  }

  addSubcommand(input) {
    const instance = new SlashCommandSubcommandBuilder();
    const result = typeof input === "function" ? input(instance) : input;
    this.options.push(result || instance);
    return this;
  }

  addSubcommandGroup(input) {
    const instance = new SlashCommandSubcommandGroupBuilder();
    const result = typeof input === "function" ? input(instance) : input;
    this.options.push(result || instance);
    return this;
  }

  toJSON() {
    validateName(this.name, "command");
    validateDescription(this.description, "command");

    const options = this.options.map((option) => (option.toJSON ? option.toJSON() : option));
    const hasSub = options.some((option) => option.type === ApplicationCommandOptionType.Subcommand || option.type === ApplicationCommandOptionType.SubcommandGroup);
    const hasPlain = options.some((option) => option.type !== ApplicationCommandOptionType.Subcommand && option.type !== ApplicationCommandOptionType.SubcommandGroup);

    if (hasSub && hasPlain) throw new RangeError("Commands cannot mix subcommands and regular options.");
    if (!hasSub) validateOptions(options);

    return {
      type: ApplicationCommandType.ChatInput,
      name: this.name,
      description: this.description,
      name_localizations: this.name_localizations,
      description_localizations: this.description_localizations,
      default_member_permissions: this.default_member_permissions,
      dm_permission: this.dm_permission,
      nsfw: this.nsfw,
      contexts: this.contexts,
      integration_types: this.integration_types,
      options,
    };
  }
}

class ContextMenuCommandBuilder {
  constructor() {
    this.name = "";
    this.type = undefined;
    this.default_member_permissions = undefined;
    this.dm_permission = undefined;
  }

  setName(name) {
    this.name = name;
    return this;
  }

  setType(type) {
    this.type = type;
    return this;
  }

  setNameLocalizations(localizations) {
    this.name_localizations = localizations;
    return this;
  }

  setDefaultMemberPermissions(permissions) {
    this.default_member_permissions = permissions === null || permissions === undefined ? null : PermissionsBitField.resolve(permissions).toString();
    return this;
  }

  setDMPermission(enabled = true) {
    this.dm_permission = enabled;
    return this;
  }

  setContexts(...contexts) {
    this.contexts = contexts.flat();
    return this;
  }

  setIntegrationTypes(...types) {
    this.integration_types = types.flat();
    return this;
  }

  toJSON() {
    if (typeof this.name !== "string" || this.name.length < 1 || this.name.length > 32) throw new RangeError("Context menu names must have between 1 and 32 characters.");
    if (this.type !== ApplicationCommandType.User && this.type !== ApplicationCommandType.Message) throw new RangeError("Context menu commands need a type (ApplicationCommandType.User or ApplicationCommandType.Message).");

    return {
      type: this.type,
      name: this.name,
      name_localizations: this.name_localizations,
      default_member_permissions: this.default_member_permissions,
      dm_permission: this.dm_permission,
      contexts: this.contexts,
      integration_types: this.integration_types,
    };
  }
}

module.exports = {
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
  SlashCommandStringOption,
  SlashCommandIntegerOption,
  SlashCommandNumberOption,
  SlashCommandBooleanOption,
  SlashCommandUserOption,
  SlashCommandChannelOption,
  SlashCommandRoleOption,
  SlashCommandMentionableOption,
  SlashCommandAttachmentOption,
  ContextMenuCommandBuilder,
};
