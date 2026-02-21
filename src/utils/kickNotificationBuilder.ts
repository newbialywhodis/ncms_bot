import {
  ContainerBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorSpacingSize,
} from 'discord.js';

export interface KickStreamData {
  channelSlug: string;
  channelName: string;
  streamTitle: string;
  categoryName: string | null;
  thumbnailUrl: string | null;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m} min`;
}

export function buildLiveNotification(data: KickStreamData) {
  const { channelSlug, channelName, streamTitle, categoryName, thumbnailUrl } = data;

  const lines = [`📺 **${streamTitle}**`];
  if (categoryName) lines.push(`🎮 ${categoryName}`);

  const container = new ContainerBuilder()
    .setAccentColor(0x53fc18)
    .addTextDisplayComponents((text) =>
      text.setContent(`🟢 **${channelName}** jest teraz LIVE na Kick!`),
    )
    .addSeparatorComponents((sep) => sep.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(lines.join('\n')));

  if (thumbnailUrl) {
    container
      .addSeparatorComponents((sep) => sep.setSpacing(SeparatorSpacingSize.Small))
      .addMediaGalleryComponents((gallery) =>
        gallery.addItems((item) => item.setURL(thumbnailUrl)),
      );
  }

  container
    .addSeparatorComponents((sep) => sep.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.addComponents(
        new ButtonBuilder()
          .setLabel('Oglądaj na Kick')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://kick.com/${channelSlug}`),
      ),
    );

  return { components: [container] };
}

export function buildStreamEndedNotification(
  channelSlug: string,
  channelName: string,
  durationMinutes: number | null,
) {
  const durationText =
    durationMinutes != null ? ` · ⏱️ ${formatDuration(durationMinutes)}` : '';

  const container = new ContainerBuilder()
    .setAccentColor(0x808080)
    .addTextDisplayComponents((text) =>
      text.setContent(`⚫ **${channelName}** zakończył transmisję${durationText}.`),
    )
    .addSeparatorComponents((sep) => sep.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.addComponents(
        new ButtonBuilder()
          .setLabel('Odwiedź kanał')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://kick.com/${channelSlug}`),
      ),
    );

  return { components: [container] };
}
