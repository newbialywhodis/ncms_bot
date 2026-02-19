import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export interface PollDisplayData {
  pollId: number;
  scheduledTime: Date;
  presentUsers: string[];
  absentUsers: string[];
  noResponseCount: number;
}

const DAYS_PL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

function dayName(date: Date): string {
  return DAYS_PL[date.getDay()] ?? '';
}

function formatList(ids: string[]): string {
  if (ids.length === 0) return '*Brak*';
  return ids.map((id) => `<@${id}>`).join('\n');
}

export function buildPollMessage(data: PollDisplayData) {
  const { pollId, scheduledTime, presentUsers, absentUsers, noResponseCount } = data;

  const date = scheduledTime.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  const time = scheduledTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

  const embed = new EmbedBuilder()
    .setTitle(`⚽  Ankieta - ${dayName(scheduledTime)}, ${date}  ·  ${time}`)
    .setColor(0x00b36b)
    .addFields(
      {
        name: `✅  Obecni (${presentUsers.length})`,
        value: formatList(presentUsers),
        inline: true,
      },
      {
        name: `❌  Nieobecni (${absentUsers.length})`,
        value: formatList(absentUsers),
        inline: true,
      },
    )
    .setTimestamp(scheduledTime);

  if (noResponseCount > 0) {
    embed.setFooter({ text: `⏳ Brak odpowiedzi: ${noResponseCount} graczy` });
  } else if (presentUsers.length + absentUsers.length > 0) {
    embed.setFooter({ text: '✅ Wszyscy odpowiedzieli!' });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`poll:present:${pollId}`)
      .setLabel('✅  Obecny')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`poll:absent:${pollId}`)
      .setLabel('❌  Nieobecny')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}
