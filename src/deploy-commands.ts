import { REST, Routes } from 'discord.js';
import { config } from './config.ts';
import { commands } from './commands/index.ts';

const rest = new REST().setToken(config.token);
const body = [...commands.values()].map((c) => c.data.toJSON());

console.log(`Rejestruję ${body.length} komend(y) na serwerze ${config.guildId}...`);

await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });

console.log('✅ Komendy zarejestrowane!');
