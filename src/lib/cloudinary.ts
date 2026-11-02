export function getThumbnailUrl(originalUrl: string, width = 100, height = 100): string {
  if (!originalUrl || !originalUrl.includes('cloudinary.com')) return originalUrl;
  return originalUrl.replace('/upload/', `/upload/w_${width},h_${height},c_fill,q_auto/`);
}
