const RGB = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];

export function scoutingColors(colors?: string[]) {
  const valid = (color?: string) => color && /^#[a-f0-9]{6}$/i.test(color) ? color : null;
  const primary = valid(colors?.[0]) ?? "#6b1a2c";
  const secondary = valid(colors?.[1]) ?? "#d4a24c";
  const primaryRgb = RGB(primary);
  const luminance = primaryRgb.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const light = luminance > 0.179;
  return {
    primary, secondary, primaryRgb, secondaryRgb: RGB(secondary),
    onPrimary: light ? "#101014" : "#ffffff",
    ink: light ? "#27252b" : primary,
    inkRgb: light ? [39, 37, 43] : primaryRgb,
  };
}
