# byacord.js

Biblioteca para criar bots na **Byacord** com os mesmos nomes de classes e funções do discord.js v14 — inclusive **Components V2**.

```bash
npm install byacord.js
```

Requer Node 18+. Única dependência: `ws` (JS puro, funciona no Termux).

## Exemplo

```js
const { Client, GatewayIntentBits, Events } = require("byacord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => console.log(`Online como ${c.user.tag}`));

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "ping") await interaction.reply("Pong!");
});

client.login("TOKEN");
```

Mais exemplos na pasta `examples/` (no GitHub).

## O que tem

- `Client`, eventos (`Events.*`), `client.application.commands.set/create/edit/delete`
- Builders: `SlashCommandBuilder` (subcomandos, grupos, choices, autocomplete), `ContextMenuCommandBuilder`, `EmbedBuilder`, `AttachmentBuilder`, `ModalBuilder`, `ActionRowBuilder`, `ButtonBuilder`, selects (string/user/role/mentionable/channel)
- **Components V2:** `ContainerBuilder`, `SectionBuilder`, `TextDisplayBuilder`, `SeparatorBuilder`, `ThumbnailBuilder`, `MediaGalleryBuilder`, `FileBuilder`, `LabelBuilder` (aceitam callback `(x) => x.set...` como no discord.js)
- Interações: `reply`, `deferReply`, `deferUpdate`, `update`, `editReply`, `followUp`, `showModal`, `awaitModalSubmit`, `respond` (autocomplete), `options.getString/getUser/getMember/...`
- Collectors: `createMessageComponentCollector`, `awaitMessageComponent`, `createMessageCollector`, `awaitMessages`
- Managers: `guild.members/channels/roles/bans`, `channel.messages`, `client.users/guilds/channels`
- `PermissionsBitField`, `IntentsBitField`, `Collection`, formatters (`bold`, `time`, `userMention`...), `WebhookClient`
- Upload de arquivos (multipart), rate limit com retry, reconexão com resume

## Importante

Esta lib segue as rotas e o gateway do Discord. Só o que a Byacord implementar de fato vai funcionar. Para depurar: `BYACORD_DEBUG=1 node index.js`.

Padrões que podem precisar de ajuste (opções do `Client`): `api` (padrão `https://client.bya.lat/api/v9`), `gateway`, `cdn` (avatares), `web` (links de mensagem).

Não implementado: sharding, voz, `.d.ts` (tipos TypeScript).

## Testes

`npm test` — sobe uma Byacord falsa local e testa a lib (não testa o servidor real).

MIT © SowzaX
