const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const cron = require("node-cron");
const config = require("./config.json");
const { Client, GatewayIntentBits, Partials } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Necessário para ler o conteúdo das mensagens
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // Necessário para DMs
});

let storedLevels = require("./players.json");

async function fetchOnlinePlayers() {
  try {
    const response = await axios.get(
      "https://ntoultimate.com.br/onlinelist.php",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      }
    );

    const $ = cheerio.load(response.data);
    const players = {};

    // Busca cada linha da tabela
    $("table tr").each((_, row) => {
      const columns = $(row).find("td");
      if (columns.length === 3) {
        const name = $(columns[1]).text().trim();
        const level = parseInt($(columns[2]).text().trim(), 10);

        if (name && !isNaN(level)) {
          players[name] = level;
        }
      }
    });

    return players;
  } catch (error) {
    console.error("Erro ao buscar jogadores online:", error);
    return {};
  }
}

async function checkLevels() {
  const onlinePlayers = await fetchOnlinePlayers();
  const localConfig = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
  const monitoredPlayers = localConfig.monitoredPlayers;
  console.log("Jogadores monitorados:", monitoredPlayers);

  for (const player of monitoredPlayers) {
    const currentLevel = onlinePlayers[player];
    const previousLevel = storedLevels[player] || 0;

    if (currentLevel && currentLevel > previousLevel) {
      console.log(
        `📈 **${player}** subiu de nível: ${previousLevel} ➡️ ${currentLevel}`
      );
      storedLevels[player] = currentLevel;

      if (previousLevel != 0 && currentLevel - previousLevel == 1) {
        await sendMessageOnChanel(
          `📈 **${player}** subiu de nível: ${previousLevel} ➡️ ${currentLevel}`
        );
      }
    } else if (currentLevel && currentLevel < previousLevel) {
      console.log(
        `📉 **${player}** desceu de nível: ${previousLevel} ➡️ ${currentLevel}`
      );
      storedLevels[player] = currentLevel;
    }
  }

  fs.writeFileSync("./players.json", JSON.stringify(storedLevels, null, 2));
}

// Agendamento do scraping (ex: a cada 5 minutos)
cron.schedule(config.checkInterval, checkLevels);

// Executa logo na inicialização também
checkLevels();

client.once("ready", () => {
  console.log(`Bot online como ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
  // Ignora mensagens de outros bots para evitar loops infinitos
  if (message.author.bot) return;

  console.log("Mensagem recebida:", message.content);

  // se não for o channel de comandos, ignora
  if (message.channel.id !== config.DISCORD_CHANNEL_COMMAND_ID) {
    console.log("Mensagem não é do canal de comandos.");
    console.log(
      `ID do canal: ${message.channel.id} - ID do canal de comandos: ${config.DISCORD_CHANNEL_COMMAND_ID}`
    );
    return;
  }

  if (message.content.startsWith("!addplayer")) {
    console.log("Adicionando jogador...");
    const playerName = message.content.split(" ").slice(1).join(" ");
    await adicionaPlayer(playerName);
  }

  if (message.content.startsWith("!removeplayer")) {
    const playerName = message.content.split(" ").slice(1).join(" ");
    removePlayer(playerName);
  }

  if (message.content.startsWith("!listar")) {
    const localConfig = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
    const monitoredPlayers = localConfig.monitoredPlayers;
    await sendInformativeMessage(
      `Jogadores monitorados: ${monitoredPlayers.join(", ")}`
    );
  }
});

async function adicionaPlayer(name) {
  try {
    if (!name || typeof name !== "string") {
      console.log("Nome inválido.");
      return;
    }

    const localConfig = JSON.parse(fs.readFileSync("./config.json", "utf-8"));

    console.log("Jogadores monitorados:", localConfig.monitoredPlayers);

    if (!localConfig.monitoredPlayers.includes(name)) {
      localConfig.monitoredPlayers.push(name);
      fs.writeFileSync("./config.json", JSON.stringify(localConfig, null, 2));
      console.log(`Jogador "${name}" adicionado com sucesso.`);
      await sendInformativeMessage(`Jogador "${name}" adicionado com sucesso.`);
    } else {
      console.log(`Jogador "${name}" já está sendo monitorado.`);
    }
  } catch (err) {
    console.error(err);
  }
}

async function removePlayer(name) {
  try {
    if (!name || typeof name !== "string") {
      console.log("Nome inválido.");
      return;
    }

    const localConfig = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
    const index = localConfig.monitoredPlayers.indexOf(name);

    const players = JSON.parse(fs.readFileSync("./players.json", "utf-8"));

    if (index !== -1) {
      localConfig.monitoredPlayers.splice(index, 1);
      fs.writeFileSync("./config.json", JSON.stringify(localConfig, null, 2));
      delete players[name];
      fs.writeFileSync("./players.json", JSON.stringify(players, null, 2));
      console.log(`Jogador "${name}" removido com sucesso.`);
      await sendInformativeMessage(`Jogador "${name}" removido com sucesso.`);
    } else {
      console.log(`Jogador "${name}" não encontrado na lista.`);
    }
  } catch (err) {
    console.error(err);
  }
}

async function sendMessageOnChanel(message) {
  const localConfig = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
  const targetChannel = await client.channels.fetch(
    localConfig.DISCORD_CHANNEL_ID
  );

  if (targetChannel) {
    targetChannel.send(message);
  } else {
    console.error("Canal não encontrado.");
  }
}

async function sendInformativeMessage(message) {
  const localConfig = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
  const targetChannel = await client.channels.fetch(
    localConfig.DISCORD_CHANNEL_COMMAND_ID
  );

  if (targetChannel) {
    targetChannel.send(message);
  } else {
    console.error("Canal não encontrado.");
  }
}

client.login(config.DISCORD_TOKEN);
