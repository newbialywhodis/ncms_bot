import { Collection } from 'discord.js';
import type { Command } from '../client.ts';
import { ankieta } from './ankieta.ts';
import { przypomnij } from './przypomnij.ts';
import { urlop } from './urlop.ts';

export const commands = new Collection<string, Command>([
  [ankieta.data.name, ankieta],
  [przypomnij.data.name, przypomnij],
  [urlop.data.name, urlop],
]);
