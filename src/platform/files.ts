/**
 * Hands a text file to the user: a download in the browser. Returns false if
 * they backed out — a browser download never reports that, so here it is
 * always true.
 */
export async function saveTextFile(name: string, text: string, mime: string): Promise<boolean> {
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
