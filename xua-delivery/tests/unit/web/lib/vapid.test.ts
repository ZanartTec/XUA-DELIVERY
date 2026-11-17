import { describe, expect, it } from "vitest";
import { isIosWithoutInstall, urlBase64ToUint8Array } from "@/src/lib/vapid";

/** U13 — conversão da chave VAPID e detecção do iPhone sem app instalado. */
describe("urlBase64ToUint8Array", () => {
  it("converte base64url (com - e _, sem padding)", () => {
    const bytes = Uint8Array.from([251, 255, 191, 0, 1]);
    const base64Url = Buffer.from(bytes).toString("base64url");
    expect(base64Url).toMatch(/[-_]/);
    expect(Array.from(urlBase64ToUint8Array(base64Url))).toEqual(Array.from(bytes));
  });

  it("chave VAPID real tem 65 bytes (ponto P-256 não comprimido)", () => {
    const key = Buffer.alloc(65, 7);
    key[0] = 4;
    const converted = urlBase64ToUint8Array(key.toString("base64url"));
    expect(converted).toHaveLength(65);
    expect(converted[0]).toBe(4);
  });
});

describe("isIosWithoutInstall", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

  it("iPhone no navegador precisa instalar", () => {
    expect(isIosWithoutInstall(iphone, false)).toBe(true);
  });

  it("iPhone com app instalado pode ativar", () => {
    expect(isIosWithoutInstall(iphone, true)).toBe(false);
  });

  it("Android não é afetado", () => {
    expect(isIosWithoutInstall("Mozilla/5.0 (Linux; Android 14)", false)).toBe(false);
  });
});
