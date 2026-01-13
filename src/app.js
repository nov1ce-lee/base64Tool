const STRING_TOKEN = 0x06;

function base64ToBase64Url(s) {
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBase64(s) {
  const padLen = (4 - (s.length % 4)) % 4;
  return s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen);
}

function setStatus(el, kind, text) {
  el.style.display = "block";
  el.classList.remove("ok", "err");
  if (kind === "ok") el.classList.add("ok");
  if (kind === "err") el.classList.add("err");
  el.textContent = text;
}

function clearStatus(el) {
  el.style.display = "none";
  el.textContent = "";
  el.classList.remove("ok", "err");
}

function read7bitEncodedInt(raw, pos) {
  let result = 0;
  let shift = 0;
  let offset = pos;
  while (true) {
    const b = raw[offset++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) throw new Error("7-bit length overflow");
  }
  return { length: result, offset };
}

function write7bitEncodedInt(value) {
  const bytes = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v | 0x80) & 0xff);
    v >>>= 7;
  }
  bytes.push(v & 0xff);
  return new Uint8Array(bytes);
}

function extractBinaryFormatterString(raw) {
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== STRING_TOKEN) continue;
    const strlenOffset = i + 5;
    if (strlenOffset >= raw.length) continue;
    const lenInfo = read7bitEncodedInt(raw, strlenOffset);
    const strlen = lenInfo.length;
    const stringStart = lenInfo.offset;
    const stringEnd = stringStart + strlen;
    if (stringEnd > raw.length) continue;
    const utf8Bytes = raw.slice(stringStart, stringEnd);
    const decoded = new TextDecoder("utf-8").decode(utf8Bytes);
    return {
      encoded: decoded,
      meta: {
        header: raw.slice(0, strlenOffset),
        footer: raw.slice(stringEnd),
        strlenOffset,
        stringStart,
        stringEnd,
      },
    };
  }
  throw new Error("未找到 BinaryFormatter 字符串对象(0x06)");
}

function getCryptoConfig() {
  const algo = document.getElementById("cryptoAlgo").value;
  const keyText = document.getElementById("cryptoKey").value;
  const encoding = document.getElementById("cipherEncoding").value;
  return { algo, keyText, encoding };
}

function encodeCiphertextFromCryptoJsCipherParams(cipherParams, encoding) {
  const b64 = cipherParams.toString();
  if (encoding === "base64") return b64;
  if (encoding === "base64url") return base64ToBase64Url(b64);
  if (encoding === "hex") return cipherParams.ciphertext.toString(CryptoJS.enc.Hex);
  throw new Error("未知输出编码");
}

function parseCiphertextToWordArray(cipherText, encoding) {
  if (encoding === "base64") return CryptoJS.enc.Base64.parse(cipherText);
  if (encoding === "base64url") return CryptoJS.enc.Base64.parse(base64UrlToBase64(cipherText));
  if (encoding === "hex") return CryptoJS.enc.Hex.parse(cipherText);
  throw new Error("未知输入编码");
}

function encodeUtf8ToBase64(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

function decodeBase64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

function hexFromUtf8(s) {
  const bytes = new TextEncoder().encode(s);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function utf8FromHex(hex) {
  if (hex.length % 2 !== 0) throw new Error("Hex 长度必须是偶数");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder("utf-8").decode(bytes);
}

function encryptText(plainText, cfg) {
  if (cfg.algo === "none") {
    if (cfg.encoding === "base64") return encodeUtf8ToBase64(plainText);
    if (cfg.encoding === "base64url") return base64ToBase64Url(encodeUtf8ToBase64(plainText));
    if (cfg.encoding === "hex") return hexFromUtf8(plainText);
    throw new Error("未知输出编码");
  }

  if (!window.CryptoJS) throw new Error("CryptoJS library is missing.");
  if (cfg.algo === "aes-ecb-pkcs7") {
    const key = CryptoJS.enc.Utf8.parse(cfg.keyText);
    const encrypted = CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encodeCiphertextFromCryptoJsCipherParams(encrypted, cfg.encoding);
  }
  throw new Error("未支持的加密方式");
}

function decryptText(cipherText, cfg) {
  if (cfg.algo === "none") {
    if (cfg.encoding === "base64") return decodeBase64ToUtf8(cipherText);
    if (cfg.encoding === "base64url") return decodeBase64ToUtf8(base64UrlToBase64(cipherText));
    if (cfg.encoding === "hex") return utf8FromHex(cipherText);
    throw new Error("未知输入编码");
  }

  if (!window.CryptoJS) throw new Error("CryptoJS library is missing.");
  if (cfg.algo === "aes-ecb-pkcs7") {
    const ciphertextWordArray = parseCiphertextToWordArray(cipherText, cfg.encoding);
    const key = CryptoJS.enc.Utf8.parse(cfg.keyText);
    const decrypted = CryptoJS.AES.decrypt({ ciphertext: ciphertextWordArray }, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  }
  throw new Error("未支持的解密方式");
}

function exportDatFromEncoded(encoded, meta) {
  const newStringBytes = new TextEncoder().encode(encoded);
  const newLengthBytes = write7bitEncodedInt(newStringBytes.length);
  const newSize = meta.header.length + newLengthBytes.length + newStringBytes.length + meta.footer.length;
  const out = new Uint8Array(newSize);
  let offset = 0;
  out.set(meta.header, offset);
  offset += meta.header.length;
  out.set(newLengthBytes, offset);
  offset += newLengthBytes.length;
  out.set(newStringBytes, offset);
  offset += newStringBytes.length;
  out.set(meta.footer, offset);
  return out;
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "export.dat";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function tryPrettyJson(text) {
  const obj = JSON.parse(text);
  return JSON.stringify(obj, null, 2);
}

const els = {
  textStatus: document.getElementById("textStatus"),
  datMeta: document.getElementById("datMeta"),
  datStatus: document.getElementById("datStatus"),
  plainText: document.getElementById("plainText"),
  cipherText: document.getElementById("cipherText"),
  extractedEncoded: document.getElementById("extractedEncoded"),
  datJson: document.getElementById("datJson"),
};

let lastDatMeta = null;

document.getElementById("btnEncrypt").addEventListener("click", () => {
  clearStatus(els.textStatus);
  try {
    const cfg = getCryptoConfig();
    els.cipherText.value = encryptText(els.plainText.value, cfg);
    setStatus(els.textStatus, "ok", "加密完成");
  } catch (e) {
    setStatus(els.textStatus, "err", String(e && e.message ? e.message : e));
  }
});

document.getElementById("btnDecrypt").addEventListener("click", () => {
  clearStatus(els.textStatus);
  try {
    const cfg = getCryptoConfig();
    els.plainText.value = decryptText(els.cipherText.value.trim(), cfg);
    setStatus(els.textStatus, "ok", "解密完成");
  } catch (e) {
    setStatus(els.textStatus, "err", String(e && e.message ? e.message : e));
  }
});

document.getElementById("btnSwap").addEventListener("click", () => {
  const a = els.plainText.value;
  els.plainText.value = els.cipherText.value;
  els.cipherText.value = a;
});

document.getElementById("btnClearText").addEventListener("click", () => {
  els.plainText.value = "";
  els.cipherText.value = "";
  clearStatus(els.textStatus);
});

document.getElementById("btnPrettyJson").addEventListener("click", () => {
  clearStatus(els.textStatus);
  try {
    els.plainText.value = tryPrettyJson(els.plainText.value);
    setStatus(els.textStatus, "ok", "JSON 已格式化");
  } catch (e) {
    setStatus(els.textStatus, "err", "JSON 解析失败：" + String(e && e.message ? e.message : e));
  }
});

document.getElementById("datFile").addEventListener("change", async (ev) => {
  clearStatus(els.datStatus);
  clearStatus(els.datMeta);
  lastDatMeta = null;
  els.extractedEncoded.value = "";
  els.datJson.value = "";
  try {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const raw = new Uint8Array(buffer);
    const extracted = extractBinaryFormatterString(raw);
    lastDatMeta = extracted.meta;
    els.extractedEncoded.value = extracted.encoded;

    const cfg = getCryptoConfig();
    const jsonText = decryptText(extracted.encoded, cfg);
    els.datJson.value = tryPrettyJson(jsonText);

    setStatus(
      els.datMeta,
      "ok",
      [
        `文件大小: ${raw.length} bytes`,
        `header: ${extracted.meta.header.length} bytes`,
        `stringStart: ${extracted.meta.stringStart}`,
        `stringEnd: ${extracted.meta.stringEnd}`,
        `footer: ${extracted.meta.footer.length} bytes`,
      ].join("\n")
    );
    setStatus(els.datStatus, "ok", "导入解析完成");
  } catch (e) {
    setStatus(els.datStatus, "err", String(e && e.message ? e.message : e));
  }
});

document.getElementById("btnCopyEncoded").addEventListener("click", async () => {
  clearStatus(els.datStatus);
  try {
    await navigator.clipboard.writeText(els.extractedEncoded.value);
    setStatus(els.datStatus, "ok", "已复制编码串");
  } catch (e) {
    setStatus(els.datStatus, "err", "复制失败：" + String(e && e.message ? e.message : e));
  }
});

document.getElementById("btnLoadEncodedToCipher").addEventListener("click", () => {
  els.cipherText.value = els.extractedEncoded.value;
  clearStatus(els.textStatus);
  setStatus(els.textStatus, "ok", "已填入“密文”输入框");
});

document.getElementById("btnPrettyDatJson").addEventListener("click", () => {
  clearStatus(els.datStatus);
  try {
    els.datJson.value = tryPrettyJson(els.datJson.value);
    setStatus(els.datStatus, "ok", "JSON 已格式化");
  } catch (e) {
    setStatus(els.datStatus, "err", "JSON 解析失败：" + String(e && e.message ? e.message : e));
  }
});

document.getElementById("btnExportDat").addEventListener("click", () => {
  clearStatus(els.datStatus);
  try {
    if (!lastDatMeta) throw new Error("未导入 .dat，无法导出");
    const cfg = getCryptoConfig();
    const jsonObj = JSON.parse(els.datJson.value);
    const jsonText = JSON.stringify(jsonObj);
    const encoded = encryptText(jsonText, cfg);
    const bytes = exportDatFromEncoded(encoded, lastDatMeta);
    const name = document.getElementById("downloadName").value || "save_export.dat";
    downloadBytes(bytes, name);
    setStatus(els.datStatus, "ok", "导出完成");
  } catch (e) {
    setStatus(els.datStatus, "err", String(e && e.message ? e.message : e));
  }
});

