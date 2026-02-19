import { client } from './client.ts';
import { config } from './config.ts';
import { handleCommand } from './handlers/commandHandler.ts';
import { handleInteraction } from './handlers/interactionHandler.ts';
import { setupVacationPanel } from './utils/vacationPanel.ts';
import { setupPollPanel } from './utils/pollPanel.ts';

import './database.ts';

client.once('clientReady', async (c) => {
  console.log(`✅ Bot zalogowany jako ${c.user.tag}`);
  console.log(`📋 Serwer: ${config.guildId} | Rola zawodnika: ${config.playerRoleId}`);
  console.log(`🔑 Dozwolone role: ${config.allowedRoleIds.join(', ')}`);

  await setupVacationPanel(c);
  await setupPollPanel(c);
});

client.on('interactionCreate', async (interaction) => {
  await handleCommand(interaction);
  await handleInteraction(interaction);
});

await client.login(config.token);