<p align="center">
  <img src="https://raw.githubusercontent.com/SowzaX/icons-utils/refs/heads/main/image/b9ea9bd2f03b4df940bd46e9ee9df47c.png" alt="Byacord" width="220" />
</p>

<h1 align="center">byacordjs</h1>

<p align="center">
  Crie bots para a <b>Byacord</b> com a mesma API do <b>discord.js v14</b> — incluindo <b>Components V2</b>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/byacordjs"><img src="https://img.shields.io/npm/v/byacordjs?color=5865f2&label=npm" alt="npm" /></a>
  <img src="https://img.shields.io/node/v/byacordjs?color=3c873a" alt="node" />
  <img src="https://img.shields.io/npm/l/byacordjs?color=blue" alt="licença" />
  <img src="https://img.shields.io/badge/depend%C3%AAncias-1-success" alt="dependências" />
</p>

---

## Por que usar

A Byacord não tinha um módulo para programar bots. A **byacordjs** resolve isso: mesmos nomes de classes, métodos e eventos do discord.js. Se você já sabe fazer bots no Discord, já sabe fazer na Byacord.

- **Familiar:** `Client`, `Events`, `SlashCommandBuilder`, `EmbedBuilder`, `interaction.reply()`...
- **Components V2:** `ContainerBuilder`, `SectionBuilder`, `TextDisplayBuilder`, `MediaGalleryBuilder` e os demais.
- **Leve:** uma única dependência (`ws`), JavaScript puro. Roda até no Termux, sem binários nativos.
- **Completa:** collectors, modais, autocomplete, permissões, upload de arquivos, rate limit com retry e reconexão automática.

## Instalação

```bash
npm install byacordjs
```

Requer **Node.js 18 ou superior**.

## Primeiros passos

```js
const { Client, GatewayIntentBits, Events, SlashCommandBuilder } = require("byacordjs");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Online como ${c.user.tag}`);

  await c.application.commands.set([
    new SlashCommandBuilder().setName("ping").setDescription("Responde pong"),
  ]);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "ping") await interaction.reply("Pong!");
});

client.login("SEU_TOKEN");
```

## Components V2

```js
const { ContainerBuilder, ButtonStyle, MessageFlags } = require("byacordjs");

const container = new ContainerBuilder()
  .setAccentColor("#5865f2")
  .addTextDisplayComponents((t) => t.setContent("# Painel"))
  .addSeparatorComponents((s) => s.setDivider(true))
  .addSectionComponents((s) =>
    s
      .addTextDisplayComponents((t) => t.setContent("Clique no botão ao lado"))
      .setButtonAccessory((b) => b.setCustomId("clicar").setLabel("Clicar").setStyle(ButtonStyle.Primary)),
  );

await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
```

Se você esquecer a flag `IsComponentsV2`, a lib adiciona sozinha quando houver componentes V2 na mensagem.

Disponíveis: `ContainerBuilder`, `SectionBuilder`, `TextDisplayBuilder`, `SeparatorBuilder`, `ThumbnailBuilder`, `MediaGalleryBuilder`, `MediaGalleryItemBuilder`, `FileBuilder` e `LabelBuilder`.

## Mais exemplos

### Modal

```js
const { ModalBuilder, TextInputBuilder, TextInputStyle } = require("byacordjs");

const modal = new ModalBuilder()
  .setCustomId("form")
  .setTitle("Formulário")
  .addComponents(new TextInputBuilder().setCustomId("nome").setLabel("Seu nome").setStyle(TextInputStyle.Short));

await interaction.showModal(modal);

const submit = await interaction.awaitModalSubmit({ time: 60_000, filter: (i) => i.customId === "form" });
await submit.reply(`Olá, ${submit.fields.getTextInputValue("nome")}!`);
```

### Collector de botões

```js
const response = await interaction.reply({ components: [row] });
const click = await response.awaitMessageComponent({ time: 30_000, filter: (i) => i.user.id === interaction.user.id });
await click.update({ content: "Clicou!", components: [] });
```

### Moderação

```js
const member = interaction.options.getMember("alvo");
await member.timeout(60_000, "Spam");
await member.ban({ deleteMessageSeconds: 3600, reason: "Spam" });
```

## Migrando do discord.js

Na maioria dos casos basta trocar o import:

```diff
- const { Client, GatewayIntentBits } = require("discord.js");
+ const { Client, GatewayIntentBits } = require("byacordjs");
```

| Diferença | Detalhe |
| --- | --- |
| Flag V2 | Adicionada automaticamente quando há componentes V2 |
| `Events.Ready` | Dispara junto com `Events.ClientReady` |
| `messageUpdate` / `messageDelete` | Usam o cache de mensagens (`messageCacheMaxSize`, padrão 100 por canal); fora dele recebem uma mensagem parcial |
| `WebhookClient` | Retorna o JSON cru da mensagem |
| Tipos TypeScript | Ainda não incluídos |

## Referência rápida

| Área | O que tem |
| --- | --- |
| **Client** | `login`, `destroy`, `ws.ping`, `uptime`, `application`, `user`, caches de `guilds`, `users` e `channels` |
| **Comandos** | `SlashCommandBuilder` (subcomandos, grupos, choices, autocomplete), `ContextMenuCommandBuilder`, `application.commands` e `guild.commands` |
| **Interações** | `reply`, `deferReply`, `deferUpdate`, `update`, `editReply`, `followUp`, `fetchReply`, `deleteReply`, `showModal`, `respond` |
| **Mensagens** | `send`, `reply`, `edit`, `delete`, `react`, `pin`, `startThread`, `bulkDelete`, arquivos (`AttachmentBuilder`) |
| **Collectors** | `createMessageCollector`, `awaitMessages`, `createMessageComponentCollector`, `awaitMessageComponent` |
| **Servidor** | `guild.members`, `channels`, `roles`, `bans` (`fetch`, `create`, `edit`, `kick`, `ban`...) |
| **Utilitários** | `PermissionsBitField`, `IntentsBitField`, `Collection`, `Colors`, formatadores (`bold`, `time`, `userMention`...) |

## Configuração

```js
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  api: "https://client.bya.lat/api/v9", // URL da API REST
  gateway: null,                         // URL do gateway (padrão: descoberta via /gateway/bot)
  cdn: "https://client.bya.lat",     // base das imagens (avatares, ícones)
  web: "https://client.bya.lat",         // base dos links de mensagem e canal
  messageCacheMaxSize: 100,              // mensagens em cache por canal
  rest: { timeout: 15000, retries: 3 },
});
```

Variáveis de ambiente: `BYACORD_API`, `BYACORD_GATEWAY` e `BYACORD_DEBUG=1` (mostra no console cada requisição e evento).

## Compatibilidade e limitações

- A lib usa as rotas e o gateway no formato do Discord. Funciona o que a Byacord implementar da mesma forma.
- Os valores padrão de `api`, `cdn` e `web` podem precisar de ajuste conforme a Byacord. Use as opções acima.
- **Ainda não incluídos:** sharding, voz e tipos TypeScript (`.d.ts`).
- Recursos sem classe própria (enquetes, convites, eventos agendados, auditoria) podem ser usados com `client.rest`:

```js
await client.rest.get("/guilds/ID/invites");
```

## Testes

```bash
npm test
```

O teste sobe uma Byacord falsa local e verifica a lib inteira. Ele valida a lógica da biblioteca, não o servidor real.

## Aviso

A **byacordjs** está em desenvolvimento ativo e ainda não é uma versão final. Ela foi feita seguindo as rotas e o gateway do Discord, e a Byacord é uma plataforma independente. Por isso, algumas funções podem não se comportar exatamente como no discord.js.

**O que pode acontecer**
- Algum recurso do discord.js que a Byacord ainda não implementou pode dar erro ou não fazer nada.
- Valores padrão como `api`, `cdn` e `web` podem precisar de ajuste (veja a seção [Configuração](#configuração)).
- Podem existir bugs que o teste local não pega, porque ele usa um servidor falso e não a Byacord real.

**Encontrou um problema?**

Me chame no Discord: [`457942889511780372`](https://discord.com/users/457942889511780372). Quanto mais detalhes, mais rápido eu resolvo. Mande:
1. O que você tentou fazer, com um trecho do código.
2. O erro que apareceu.
3. O log com `BYACORD_DEBUG=1 node seu-arquivo.js`, escondendo o token.

Se preferir, abra uma *issue* no [GitHub](https://github.com/sowzax/byacord.js/issues). 

## Contribuindo

Contribuições são bem-vindas: abra uma *issue* ou um *pull request* no [GitHub](https://github.com/sowzax/byacord.js).

## Licença

[MIT](./LICENSE) © SowzaX
