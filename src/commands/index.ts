import { Collection } from 'discord.js';
import type { Command } from '../client.ts';
import { ankieta } from './ankieta.ts';
import { pozycje } from './pozycje.ts';
import { powitania } from './powitania.ts';
import { przypomnij } from './przypomnij.ts';
import { urlop } from './urlop.ts';

export const commands = new Collection<string, Command>([
  [ankieta.data.name, ankieta],
  [pozycje.data.name, pozycje],
  [powitania.data.name, powitania],
  [przypomnij.data.name, przypomnij],
  [urlop.data.name, urlop],
]);
