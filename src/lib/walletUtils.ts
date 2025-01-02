// src/lib/walletUtils.ts

export const truncateWalletAddress = (address: string) => 
  `${address.slice(0, 6)}...`;

export const getWalletColor = (address: string): string => {
  // Get a number from first 6 chars of address
  const hash = address.slice(0, 6).split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);

  // Convert to HSL
  // Hue: 0-360 from hash
  // Saturation: Fixed high value for visibility
  // Lightness: Fixed mid-high value for dark theme
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 60%)`;
};
