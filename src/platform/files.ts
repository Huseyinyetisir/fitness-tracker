import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Hands a text file to the user. Returns false if they backed out.
 *
 * In the browser that is a download. Inside the Android app a download link
 * does nothing — the WebView has no download manager — so the file is written
 * to the app's cache and offered through the share sheet: save it to Drive,
 * Files, email, wherever.
 */
export async function saveTextFile(name: string, text: string, mime: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: name, files: [uri] });
      return true;
    } catch (e) {
      // Dismissing the share sheet rejects; that is a choice, not a failure.
      if (e instanceof Error && /cancel/i.test(e.message)) return false;
      throw e;
    }
  }

  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
