import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isNative = Capacitor.isNativePlatform();

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Native apps can't download through a link, so the file goes to the cache and opens in the share sheet
// (which also offers "Save to Files"). A cancelled sheet throws an AbortError, like navigator.share.
async function shareNative(blob, filename) {
  const { uri } = await Filesystem.writeFile({ path: filename, data: await toBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ files: [uri] });
  } catch (error) {
    if (/cancel/i.test(error?.message || '')) throw new DOMException('Share cancelled.', 'AbortError');
    throw error;
  }
}

function downloadWeb(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Returns 'shared' when the share sheet was used, 'downloaded' when the browser saved the file.
export async function shareFile(blob, filename) {
  if (isNative) {
    await shareNative(blob, filename);
    return 'shared';
  }
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return 'shared';
  }
  downloadWeb(blob, filename);
  return 'downloaded';
}

export async function saveFile(blob, filename) {
  if (isNative) {
    await shareNative(blob, filename);
    return 'shared';
  }
  downloadWeb(blob, filename);
  return 'downloaded';
}
