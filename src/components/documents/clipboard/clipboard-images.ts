/**
 * Extracts and optimizes clipboard image items into durable Base64 data URIs
 */
export async function extractClipboardImage(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      
      // If the image is excessively large, compress/resize it using an offscreen canvas
      compressImageIfLarge(dataUrl)
        .then(resolve)
        .catch(() => resolve(dataUrl)); // Fallback to raw dataUrl on compression error
    };
    reader.onerror = () => {
      reject(new Error('Failed to read image from clipboard'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Ensures high-res clipboard screenshots don't blow up document storage
 * while maintaining crisp resolution for documents.
 */
async function compressImageIfLarge(dataUrl: string, maxWidth = 1600, maxHeight = 1600): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      
      // If smaller than max bounds, keep as is
      if (width <= maxWidth && height <= maxHeight && dataUrl.length < 1024 * 1024) {
        return resolve(dataUrl);
      }

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);

      ctx.drawImage(img, 0, 0, width, height);
      // Use PNG for sharpness or JPEG for large photos
      const isPng = dataUrl.startsWith('data:image/png');
      const compressed = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.88);
      resolve(compressed);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
