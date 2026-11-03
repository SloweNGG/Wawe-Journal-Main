// Chrome yolu: CHROME ortam değişkeni, yoksa işletim sistemine göre varsayılan kurulum yeri.
export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'win32') return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  return '/usr/bin/google-chrome';
}
