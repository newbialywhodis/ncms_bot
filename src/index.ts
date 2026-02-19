import { client } from './client.ts';
import { config } from './config.ts';
import { handleCommand } from './handlers/commandHandler.ts';
import { handleInteraction } from './handlers/interactionHandler.ts';
import { setupVacationPanel } from './utils/vacationPanel.ts';
import { setupPollPanel } from './utils/pollPanel.ts';

// Inicjalizacja bazy danych (side-effect: tworzy tabele)
import './database.ts';

client.once('clientReady', async (c) => {
  console.log(`✅ Bot zalogowany jako ${c.user.tag}`);
  console.log(`📋 Serwer: ${config.guildId} | Rola graczy: ${config.playerRoleId}`);
  console.log(`🔑 Dozwolone role: ${config.allowedRoleIds.join(', ')}`);
console.log("Test auto-deploya [nowe]");
  // Ustaw panel urlopów na kanale (tworzy jeśli nie istnieje)
  await setupVacationPanel(c);

  // Ustaw panel ankiet na kanale (tworzy jeśli nie istnieje)
  await setupPollPanel(c);
});

// Prosty serwer HTTP dla Render.com, aby uniknąć błędu "No open ports detected"
const port = process.env.PORT || 10000;
Bun.serve({
  port,
  fetch() {
    return new Response("Bot is alive!");
  },
});
console.log(`🌐 Serwer HTTP nasłuchuje na porcie ${port}`);

client.on('interactionCreate', async (interaction) => {
  await handleCommand(interaction);
  await handleInteraction(interaction);
});

await client.login(config.token);
