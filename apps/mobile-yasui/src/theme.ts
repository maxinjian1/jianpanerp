export const C = {
  red: '#BF0000', // 楽天系の価格・強調色
  orange: '#F28C28',
  green: '#2A7D2A',
  ink: '#1A1A1A',
  sub: '#666666',
  line: '#E8E8E8',
  bg: '#F5F5F5',
  white: '#FFFFFF',
  gold: '#C9A227',
  silver: '#8E9AA6',
  bronze: '#A86B3C',
};
export const yen = (amount: string | number) => `¥${Math.round(Number(amount)).toLocaleString('ja-JP')}`;
