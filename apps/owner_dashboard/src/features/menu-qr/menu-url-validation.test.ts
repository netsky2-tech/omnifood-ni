import { describe, expect, it } from "vitest";
import {
  MAX_MENU_URL_PAYLOAD_BYTES,
  validateMenuUrl,
} from "@/features/menu-qr/qr-encode";

describe("validateMenuUrl", () => {
  it("accepts an https URL and returns the trimmed value", () => {
    const result = validateMenuUrl("  https://example.com/menu  ");
    expect(result).toEqual({ ok: true, url: "https://example.com/menu" });
  });

  it("accepts an explicit http URL", () => {
    const result = validateMenuUrl("http://192.168.1.20:8080/menu.pdf");
    expect(result).toEqual({ ok: true, url: "http://192.168.1.20:8080/menu.pdf" });
  });

  it("accepts a Google Drive share link", () => {
    const url = "https://drive.google.com/file/d/1AbC_dE123/view?usp=sharing";
    expect(validateMenuUrl(url)).toEqual({ ok: true, url });
  });

  it.each(["", "   ", "\t\n"])("rejects an empty or whitespace-only value", (input) => {
    const result = validateMenuUrl(input);
    expect(result).toMatchObject({ ok: false, code: "empty" });
  });

  it.each([
    ["ftp", "ftp://example.com/menu.pdf"],
    ["javascript", "javascript:alert(1)"],
    ["data", "data:text/html,<h1>menu</h1>"],
    ["mailto", "mailto:owner@example.com"],
  ])("rejects an unsupported scheme (%s)", (_name, input) => {
    const result = validateMenuUrl(input);
    expect(result).toMatchObject({ ok: false, code: "unsupported_scheme" });
  });

  it("rejects a non-URL string as invalid_url", () => {
    const result = validateMenuUrl("not a url");
    expect(result).toMatchObject({ ok: false, code: "invalid_url" });
  });

  it.each([
    ["user only", "https://user@example.com/menu"],
    ["user and password", "https://user:pass@example.com/menu"],
    ["password only", "https://:pass@example.com/menu"],
  ])("rejects credential-bearing URLs (%s)", (_name, input) => {
    const result = validateMenuUrl(input);
    expect(result).toMatchObject({ ok: false, code: "credentials" });
  });

  it("accepts an uppercase scheme and returns the canonical lowercase URL", () => {
    expect(validateMenuUrl("HTTPS://EXAMPLE.com/MENU")).toEqual({
      ok: true,
      url: "https://example.com/MENU",
    });
  });

  it("strips embedded control whitespace from the canonical payload", () => {
    expect(validateMenuUrl("https://exa\tmple.com/men\nu")).toEqual({
      ok: true,
      url: "https://example.com/menu",
    });
  });

  it("percent-encodes raw spaces in the canonical payload", () => {
    const result = validateMenuUrl("https://example.com/a b?x=1");
    expect(result).toEqual({
      ok: true,
      url: "https://example.com/a%20b?x=1",
    });
  });

  it("rejects a multibyte URL that exceeds the UTF-8 byte bound despite a short character count", () => {
    // 627 UTF-16 code units but ~1228 UTF-8 bytes: a code-unit check would pass.
    const url = `https://example.com/menú?d=${"ñ".repeat(600)}`;
    expect(url.length).toBeLessThan(MAX_MENU_URL_PAYLOAD_BYTES);
    const result = validateMenuUrl(url);
    expect(result).toMatchObject({ ok: false, code: "oversized" });
  });

  it("accepts an ASCII URL at exactly the UTF-8 byte bound", () => {
    const prefix = "https://example.com/menu?d=";
    const url = prefix + "a".repeat(MAX_MENU_URL_PAYLOAD_BYTES - prefix.length);
    expect(new TextEncoder().encode(url)).toHaveLength(MAX_MENU_URL_PAYLOAD_BYTES);
    expect(validateMenuUrl(url)).toEqual({ ok: true, url });
  });

  it("rejects a parseable URL beyond the UTF-8 byte bound", () => {
    const url = `https://example.com/menu?d=${"a".repeat(MAX_MENU_URL_PAYLOAD_BYTES)}`;
    const result = validateMenuUrl(url);
    expect(result).toMatchObject({ ok: false, code: "oversized" });
  });

  it("rejects an unparseable oversized value as invalid_url (parse precedes the byte bound)", () => {
    const result = validateMenuUrl("x".repeat(MAX_MENU_URL_PAYLOAD_BYTES + 1));
    expect(result).toMatchObject({ ok: false, code: "invalid_url" });
  });
});
