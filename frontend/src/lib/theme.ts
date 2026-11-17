function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16) / 255)
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

export function foreground(background: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(background)) return '#0B101E'
  const light = luminance(background)
  const dark = luminance('#0B101E')
  return (light + 0.05) / (dark + 0.05) >= 1.05 / (light + 0.05) ? '#0B101E' : '#FFFFFF'
}
