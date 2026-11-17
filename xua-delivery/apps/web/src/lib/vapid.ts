/**
 * Chave pública VAPID (base64url, como o `web-push` gera) → bytes, que é o
 * formato que `pushManager.subscribe({ applicationServerKey })` aceita em
 * todos os navegadores. Passar a string direto funciona no Chrome, mas não
 * no Safari/Firefox antigos.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** iPhone/iPad: Web Push só existe com o app instalado na tela inicial (iOS 16.4+). */
export function isIosWithoutInstall(userAgent: string, standalone: boolean): boolean {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && /Mobile/.test(userAgent));
  return ios && !standalone;
}
