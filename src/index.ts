import { client } from './client.ts';
import { config } from './config.ts';
import { handleCommand } from './handlers/commandHandler.ts';
import { handleInteraction } from './handlers/interactionHandler.ts';
import { handleGuildMemberAdd, handleGuildMemberRemove } from './handlers/memberHandler.ts';
import { setupVacationPanel } from './utils/vacationPanel.ts';
import { setupPollPanel } from './utils/pollPanel.ts';
import { startKickWebhookServer } from './webhooks/kickWebhook.ts';

import './database.ts';

client.once('clientReady', async (c) => {
  console.log(`✅ Bot zalogowany jako ${c.user.tag}`);
  console.log(`📋 Serwer: ${config.guildId} | Rola zawodnika: ${config.playerRoleId}`);
  console.log(`🔑 Dozwolone role: ${config.allowedRoleIds.join(', ')}`);

  await setupVacationPanel(c);
  await setupPollPanel(c);
  startKickWebhookServer(c);
});

client.on('interactionCreate', async (interaction) => {
  await handleCommand(interaction);
  await handleInteraction(interaction);
});

client.on('guildMemberAdd', async (member) => {
  await handleGuildMemberAdd(member);
});

client.on('guildMemberRemove', async (member) => {
  await handleGuildMemberRemove(member);
});

await client.login(config.token);
