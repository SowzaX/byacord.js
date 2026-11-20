const { TimestampStyles } = require("./constants");

function bold(text) {
  return `**${text}**`;
}

function italic(text) {
  return `_${text}_`;
}

function underline(text) {
  return `__${text}__`;
}

function strikethrough(text) {
  return `~~${text}~~`;
}

function spoiler(text) {
  return `||${text}||`;
}

function quote(text) {
  return `> ${text}`;
}

function blockQuote(text) {
  return `>>> ${text}`;
}

function inlineCode(text) {
  return `\`${text}\``;
}

function codeBlock(language, content) {
  if (content === undefined) return `\`\`\`\n${language}\n\`\`\``;
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

function hyperlink(content, url, title) {
  return title ? `[${content}](${url} "${title}")` : `[${content}](${url})`;
}

function hideLinkEmbed(url) {
  return `<${url}>`;
}

function heading(text, level = 1) {
  return `${"#".repeat(level)} ${text}`;
}

function subtext(text) {
  return `-# ${text}`;
}

function userMention(id) {
  return `<@${id}>`;
}

function channelMention(id) {
  return `<#${id}>`;
}

function roleMention(id) {
  return `<@&${id}>`;
}

function chatInputApplicationCommandMention(name, id) {
  return `</${name}:${id}>`;
}

function time(timeOrSeconds, style) {
  let seconds = timeOrSeconds;
  if (timeOrSeconds instanceof Date) seconds = Math.floor(timeOrSeconds.getTime() / 1000);
  if (seconds === undefined) seconds = Math.floor(Date.now() / 1000);
  return style ? `<t:${seconds}:${style}>` : `<t:${seconds}>`;
}

function escapeMarkdown(text) {
  return String(text).replace(/([\\*_~`|>])/g, "\\$1");
}

module.exports = {
  bold,
  italic,
  underline,
  strikethrough,
  spoiler,
  quote,
  blockQuote,
  inlineCode,
  codeBlock,
  hyperlink,
  hideLinkEmbed,
  heading,
  subtext,
  userMention,
  channelMention,
  roleMention,
  chatInputApplicationCommandMention,
  time,
  escapeMarkdown,
  TimestampStyles,
};
