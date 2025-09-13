// 🎯 将选中元素的原始资源提取为可下载 ZIP（HTML/CSS/JS/图片/字体）
// 选中元素后在控制台运行：extractOriginalToZip($0)

async function extractOriginalToZip(element) {
  if (!element) {
    console.log("❌ 请先选中元素，然后运行 extractOriginalToZip($0)");
    return;
  }

  console.log("🚀 开始提取并打包 ZIP...");

  // 动态加载 JSZip（如页面未预先引入）
  async function loadJSZipIfNeeded() {
    if (window.JSZip) return window.JSZip;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
    });
    return window.JSZip;
  }

  // ========= 内置无依赖 ZIP 生成器（仅存储，无压缩）作为 CSP 回退 =========
  function createCRC32Table() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  }
  const CRC32_TABLE = createCRC32Table();
  function crc32(bytes) {
    let c = 0 ^ (-1);
    for (let i = 0; i < bytes.length; i++) {
      c = (c >>> 8) ^ CRC32_TABLE[(c ^ bytes[i]) & 0xFF];
    }
    return (c ^ (-1)) >>> 0;
  }
  function strToUtf8Bytes(str) {
    return new TextEncoder().encode(str);
  }
  function numToLE(num, bytes) {
    const out = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) out[i] = (num >>> (8 * i)) & 0xFF;
    return out;
  }
  class SimpleZipFolder {
    constructor(root, prefix) {
      this.root = root;
      this.prefix = prefix || '';
    }
    folder(path) {
      const p = this.prefix + path.replace(/^\/+|\/+$/g, '') + '/';
      return new SimpleZipFolder(this.root, p);
    }
    file(name, data) {
      this.root._addFile(this.prefix + name, data);
    }
    async generateAsync() {
      return await this.root.generateAsync();
    }
  }
  class SimpleZip {
    constructor() {
      this.files = []; // {name, bytes}
      this.root = new SimpleZipFolder(this, '');
    }
    folder(path) { return this.root.folder(path); }
    file(name, data) { this.root.file(name, data); }
    _addFile(name, data) {
      let bytes;
      if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else if (data instanceof Uint8Array) bytes = data;
      else if (typeof data === 'string') bytes = strToUtf8Bytes(data);
      else if (data instanceof Blob) {
        // Blob 转 Uint8Array（同步不支持，这里简单处理：提示用户降级）
        throw new Error('SimpleZip 不支持直接写入 Blob，请传入字符串或 ArrayBuffer');
      } else {
        bytes = strToUtf8Bytes(String(data));
      }
      this.files.push({ name, bytes });
    }
    async generateAsync() { return await this.generateBlob(); }
    async generateBlob() {
      const chunks = [];
      const central = [];
      let offset = 0;
      for (const f of this.files) {
        const nameBytes = strToUtf8Bytes(f.name);
        const crc = crc32(f.bytes);
        const localHeader = [
          numToLE(0x04034b50, 4), // Local file header signature
          numToLE(20, 2), // version needed
          numToLE(0, 2), // flags
          numToLE(0, 2), // method store
          numToLE(0, 2), // time
          numToLE(0, 2), // date
          numToLE(crc, 4),
          numToLE(f.bytes.length, 4),
          numToLE(f.bytes.length, 4),
          numToLE(nameBytes.length, 2),
          numToLE(0, 2) // extra len
        ];
        const lh = concatBytes(...localHeader, nameBytes);
        chunks.push(lh, f.bytes);
        const localOffset = offset;
        offset += lh.length + f.bytes.length;

        const centralHeader = [
          numToLE(0x02014b50, 4), // Central dir header signature
          numToLE(20, 2), // version made by
          numToLE(20, 2), // version needed
          numToLE(0, 2), // flags
          numToLE(0, 2), // method store
          numToLE(0, 2), // time
          numToLE(0, 2), // date
          numToLE(crc, 4),
          numToLE(f.bytes.length, 4),
          numToLE(f.bytes.length, 4),
          numToLE(nameBytes.length, 2),
          numToLE(0, 2), // extra len
          numToLE(0, 2), // file comment len
          numToLE(0, 2), // disk number start
          numToLE(0, 2), // internal attrs
          numToLE(0, 4), // external attrs
          numToLE(localOffset, 4)
        ];
        const cd = concatBytes(...centralHeader, nameBytes);
        central.push(cd);
      }
      const centralStart = offset;
      for (const cd of central) { chunks.push(cd); offset += cd.length; }
      const centralSize = offset - centralStart;
      const eocd = concatBytes(
        numToLE(0x06054b50, 4), // EOCD signature
        numToLE(0, 2), // disk
        numToLE(0, 2), // disk start
        numToLE(this.files.length, 2),
        numToLE(this.files.length, 2),
        numToLE(centralSize, 4),
        numToLE(centralStart, 4),
        numToLE(0, 2) // comment len
      );
      chunks.push(eocd);
      return new Blob(chunks, { type: 'application/zip' });
    }
  }
  function concatBytes(...parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // 统一的 fetch 二进制/文本工具（优先使用 omit，必要时同源回退 include）
  async function fetchWithPolicy(url, type) {
    const u = toURL(url);
    const isSameOrigin = !!u && u.origin === location.origin;
    const attempts = [
      { credentials: 'omit', mode: 'cors' },
      ...(isSameOrigin ? [{ credentials: 'include', mode: 'cors' }] : [])
    ];
    let lastErr;
    for (const opts of attempts) {
      try {
        const res = await fetch(url, opts);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (type === 'arrayBuffer') return await res.arrayBuffer();
        if (type === 'text') return await res.text();
        return await res.blob();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('下载失败');
  }
  async function fetchArrayBuffer(url) { return await fetchWithPolicy(url, 'arrayBuffer'); }
  async function fetchText(url) { return await fetchWithPolicy(url, 'text'); }

  // 将绝对 URL 解析为 {origin, pathname, search}
  function toURL(u) {
    try { return new URL(u, location.href); } catch { return null; }
  }

  // 生成安全的文件名
  function safeName(name) {
    return String(name).replace(/[^a-zA-Z0-9._-]+/g, '_');
  }

  // 收集结果数据（与 extract-enhanced 基本一致）
  const result = {
    element: {
      tag: element.tagName.toLowerCase(),
      id: element.id,
      classes: element.className ? (typeof element.className === 'string' ? element.className.split(' ') : []) : [],
      html: element.outerHTML
    },
    theme: {
      isDark: false,
      colorScheme: '',
      bodyBackground: '',
      rootClasses: [],
      dataAttributes: {}
    },
    css: {
      inline: [],
      external: [],
      rules: [],
      animations: [],
      transitions: [],
      mediaQueries: [],
      variables: []
    },
    js: {
      inline: [],
      external: [],
      eventHandlers: []
    },
    images: [],
    fonts: []
  };

  function detectThemeAndBackground() {
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    result.theme.isDark = isDarkMode;
    const html = document.documentElement;
    const body = document.body;
    result.theme.rootClasses = [
      ...Array.from(html.classList),
      ...Array.from(body.classList)
    ];
    result.theme.dataAttributes = { html: {}, body: {} };
    for (let attr of html.attributes) {
      if (attr.name.startsWith('data-')) result.theme.dataAttributes.html[attr.name] = attr.value;
    }
    for (let attr of body.attributes) {
      if (attr.name.startsWith('data-')) result.theme.dataAttributes.body[attr.name] = attr.value;
    }
    result.theme.colorScheme = getComputedStyle(html).colorScheme || getComputedStyle(body).colorScheme || '';
    const bodyBg = getComputedStyle(body).backgroundColor;
    const htmlBg = getComputedStyle(html).backgroundColor;
    const bodyBgImage = getComputedStyle(body).backgroundImage;
    const htmlBgImage = getComputedStyle(html).backgroundImage;
    result.theme.bodyBackground = {
      backgroundColor: bodyBg !== 'rgba(0, 0, 0, 0)' ? bodyBg : htmlBg,
      backgroundImage: bodyBgImage !== 'none' ? bodyBgImage : (htmlBgImage !== 'none' ? htmlBgImage : ''),
      backgroundSize: getComputedStyle(body).backgroundSize,
      backgroundPosition: getComputedStyle(body).backgroundPosition,
      backgroundRepeat: getComputedStyle(body).backgroundRepeat
    };
  }

  function calculateSpecificity(selector) {
    const ids = (selector.match(/#/g) || []).length;
    const classes = (selector.match(/\./g) || []).length;
    const tags = (selector.match(/^[a-z]+|[\s>+~][a-z]+/gi) || []).length;
    return ids * 100 + classes * 10 + tags;
  }

  function extractRelevantCSS() {
    const relevantRules = new Map();
    const animations = new Map();
    const mediaQueries = new Map();
    const cssVariables = new Map();
    const usedAnimations = new Set();
    const transitions = new Set();
    const allElements = [element, ...element.querySelectorAll('*')];
    allElements.forEach(el => {
      const style = getComputedStyle(el);
      if (style.animationName && style.animationName !== 'none') {
        style.animationName.split(',').forEach(name => usedAnimations.add(name.trim()));
      }
      if (style.transition && style.transition !== 'none') {
        transitions.add({
          element: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className : ''),
          transition: style.transition
        });
      }
    });

    for (let sheet of document.styleSheets) {
      try {
        const source = sheet.href || 'inline-style';
        if (sheet.href) {
          result.css.external.push({ url: sheet.href, rules: [] });
        }
        for (let rule of sheet.cssRules || sheet.rules || []) {
          if (rule.type === CSSRule.STYLE_RULE) {
            const selector = rule.selectorText;
            let matches = false;
            if (selector === 'html' || selector === 'body' || selector === ':root' || selector === '*' ||
                selector.includes('html.') || selector.includes('body.') ||
                selector.includes('[data-theme') || selector.includes('[data-mode')) {
              matches = true;
            }
            try {
              if (element.matches(selector)) matches = true;
              let parent = element.parentElement;
              while (parent && !matches) {
                if (parent.matches(selector)) matches = true;
                parent = parent.parentElement;
              }
            } catch (e) {
              if (result.element.id && selector.includes('#' + result.element.id)) matches = true;
              result.element.classes.forEach(cls => { if (cls && selector.includes('.' + cls)) matches = true; });
              if (selector.includes(result.element.tag)) matches = true;
            }
            if (selector.includes(':hover') || selector.includes(':focus') || selector.includes(':active') ||
                selector.includes('::before') || selector.includes('::after')) {
              const baseSelector = selector.replace(/:(hover|focus|active|before|after|:before|:after).*/g, '');
              try { if (element.matches(baseSelector)) matches = true; } catch (e) {}
            }
            if (matches) {
              relevantRules.set(selector, { cssText: rule.cssText, source, specificity: calculateSpecificity(selector) });
            }
          } else if (rule.type === CSSRule.KEYFRAMES_RULE) {
            if (usedAnimations.has(rule.name)) animations.set(rule.name, rule.cssText);
          } else if (rule.type === CSSRule.MEDIA_RULE) {
            const mediaText = rule.media.mediaText;
            if (!mediaQueries.has(mediaText)) mediaQueries.set(mediaText, []);
            for (let innerRule of rule.cssRules || []) {
              if (innerRule.type === CSSRule.STYLE_RULE) {
                if (innerRule.selectorText === 'html' || innerRule.selectorText === 'body' || innerRule.selectorText === ':root' || innerRule.selectorText === '*') {
                  mediaQueries.get(mediaText).push(innerRule.cssText);
                }
                try { if (element.matches(innerRule.selectorText)) mediaQueries.get(mediaText).push(innerRule.cssText); } catch (e) {}
              }
            }
          }
        }
      } catch (e) {
        console.warn('无法访问样式表:', sheet.href, e);
      }
    }

    if (element.style.cssText) {
      result.css.inline.push({ element: element.tagName + (element.id ? '#' + element.id : ''), style: element.style.cssText });
    }

    result.css.rules = Array.from(relevantRules.values()).sort((a, b) => a.specificity - b.specificity).map(r => r.cssText);
    result.css.animations = Array.from(animations.values());
    result.css.transitions = Array.from(transitions);
    result.css.mediaQueries = Array.from(mediaQueries.entries()).map(([media, rules]) => ({ media, rules }));
    result.css.variables = Array.from(cssVariables.entries()).map(([name, value]) => `${name}: ${value}`);
  }

  function extractJavaScript() {
    document.querySelectorAll('script').forEach(script => {
      if (script.src) {
        result.js.external.push({ url: script.src, type: script.type || 'text/javascript', async: script.async, defer: script.defer });
      } else if (script.textContent) {
        result.js.inline.push({ content: script.textContent, type: script.type || 'text/javascript' });
      }
    });
  }

  function extractImages() {
    element.querySelectorAll('img').forEach(img => {
      if (img.src) {
        result.images.push({ type: 'img', src: img.src, alt: img.alt, width: img.width, height: img.height });
      }
    });
    const allElements = [element, ...element.querySelectorAll('*')];
    allElements.forEach(el => {
      const bgImage = getComputedStyle(el).backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const urlMatch = bgImage.match(/url\(['"]?([^'"\)]+)['"]?\)/);
        if (urlMatch) result.images.push({ type: 'background', src: urlMatch[1], element: el.tagName + (el.className ? '.' + el.className : '') });
      }
    });
  }

  function extractFonts() {
    const fonts = new Set();
    for (let sheet of document.styleSheets) {
      try {
        for (let rule of sheet.cssRules || []) {
          if (rule.type === CSSRule.FONT_FACE_RULE) fonts.add(rule.cssText);
        }
      } catch (e) {}
    }
    const allElements = [element, ...element.querySelectorAll('*')];
    allElements.forEach(el => {
      const fontFamily = getComputedStyle(el).fontFamily;
      if (fontFamily) fonts.add(fontFamily);
    });
    result.fonts = Array.from(fonts);
  }

  // 执行提取
  detectThemeAndBackground();
  extractRelevantCSS();
  extractJavaScript();
  extractImages();
  extractFonts();

  // 构建项目结构并打包（自动回退 SimpleZip）
  let zip;
  try {
    const JSZipLib = await loadJSZipIfNeeded();
    zip = new JSZipLib();
  } catch (e) {
    console.warn('JSZip 加载失败，改用内置 SimpleZip：', e);
    zip = new SimpleZip();
  }
  const folderRoot = zip.folder(`component-${safeName(result.element.tag)}`);
  const folderAssets = folderRoot.folder('assets');
  const folderCss = folderRoot.folder('css');
  const folderJs = folderRoot.folder('js');

  // 下载外部 CSS、JS，并重写引用
  const externalCssFiles = [];
  const externalCssFailed = [];
  for (const css of result.css.external) {
    const url = toURL(css.url);
    if (!url) continue;
    try {
      const content = await fetchText(url.href);
      const fileName = safeName(url.hostname + url.pathname.replace(/\/+$/, '')) || 'style.css';
      const relName = `css/${fileName}`;
      // 先暂存，等资源下载并重写 url() 后再写入文件
      externalCssFiles.push({ original: css.url, rel: relName, content, base: url.href });
    } catch (e) {
      console.warn('下载外部 CSS 失败', css.url, e);
      externalCssFailed.push(css.url);
    }
  }

  const externalJsFiles = [];
  for (const js of result.js.external) {
    const url = toURL(js.url);
    if (!url) continue;
    try {
      const content = await fetchText(url.href);
      const fileName = safeName(url.hostname + url.pathname.replace(/\/+$/, '')) || 'script.js';
      const relName = `js/${fileName}`;
      folderJs.file(fileName, content);
      externalJsFiles.push({ original: js.url, rel: relName, content });
    } catch (e) {
      console.warn('下载外部 JS 失败', js.url, e);
    }
  }

  // 收集需要下载的静态资源（图片、字体、CSS 内 url()）
  const assetSet = new Map();
  const downloadedAssetHrefs = new Set();
  function addAsset(u) {
    const url = toURL(u);
    if (!url) return;
    const key = url.href;
    if (assetSet.has(key)) return;
    const ext = (url.pathname.split('.').pop() || '').toLowerCase();
    const name = safeName(url.hostname + url.pathname);
    const rel = `assets/${name}`;
    assetSet.set(key, { url, rel, ext });
  }

  // 图片
  result.images.forEach(img => addAsset(img.src));

  // CSS 内的 url()
  function collectUrlsFromCss(cssText, baseHref) {
    const urls = [];
    cssText.replace(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g, (_, u) => {
      try {
        const abs = new URL(u, baseHref || location.href).href;
        urls.push(abs);
      } catch {
        urls.push(u);
      }
      return _;
    });
    return urls;
  }
  result.css.rules.forEach(r => collectUrlsFromCss(r).forEach(addAsset));
  result.css.animations.forEach(r => collectUrlsFromCss(r).forEach(addAsset));
  result.css.mediaQueries.forEach(m => m.rules.forEach(r => collectUrlsFromCss(r).forEach(addAsset)));
  // 外链 CSS 内的 url()
  externalCssFiles.forEach(f => collectUrlsFromCss(f.content, f.base).forEach(addAsset));

  // 下载所有静态资源
  const failedAssets = [];
  for (const { url, rel } of assetSet.values()) {
    try {
      const buf = await fetchArrayBuffer(url.href);
      folderAssets.file(rel.replace('assets/', ''), buf);
      downloadedAssetHrefs.add(url.href);
    } catch (e) {
      failedAssets.push(url.href);
    }
  }

  // 重写 CSS 文本中的 url() 为本地路径
  function rewriteCssUrls(cssText, baseHref) {
    return cssText.replace(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g, (m, u) => {
      let abs;
      try { abs = new URL(u, baseHref || location.href).href; } catch { abs = u; }
      if (downloadedAssetHrefs.has(abs)) {
        const rel = assetSet.get(abs)?.rel || u;
        return `url(${rel})`;
      }
      return m;
    });
  }

  // 生成本地 css 内容（变量、规则、动画、媒体查询）
  const localCssPieces = [];
  if (result.css.variables.length) {
    localCssPieces.push(':root {');
    localCssPieces.push(result.css.variables.map(v => '  ' + v + ';').join('\n'));
    localCssPieces.push('}\n');
  }
  localCssPieces.push('/* 规则 */');
  localCssPieces.push(result.css.rules.join('\n\n'));
  if (result.css.animations.length) {
    localCssPieces.push('\n/* 动画 */');
    localCssPieces.push(result.css.animations.join('\n\n'));
  }
  if (result.css.mediaQueries.length) {
    localCssPieces.push('\n/* 媒体查询 */');
    localCssPieces.push(result.css.mediaQueries.map(mq => `@media ${mq.media} {\n${mq.rules.join('\n')}\n}`).join('\n\n'));
  }
  const localCss = rewriteCssUrls(localCssPieces.join('\n'));
  folderCss.file('component.css', localCss);

  // 写入外链 CSS（已重写 url）
  for (const f of externalCssFiles) {
    const rewritten = rewriteCssUrls(f.content, f.base);
    const fileName = f.rel.replace('css/', '');
    folderCss.file(fileName, rewritten);
  }

  // 生成本地 js（将内联脚本合并）
  if (result.js.inline.length) {
    const inlineJsCombined = result.js.inline.map(s => s.content).join('\n\n');
    folderJs.file('inline.js', inlineJsCombined);
  }

  // 构建 index.html，重写外链到本地文件
  function rewriteHtml(html) {
    let out = html;
    // 重写 <img src>
    for (const { url, rel } of assetSet.values()) {
      if (!downloadedAssetHrefs.has(url.href)) continue;
      const escaped = url.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`([\"\'])${escaped}([\"\'])`, 'g'), `$1${rel}$2`);
    }
    return out;
  }

  const externalCssLinksLocal = externalCssFiles.map(f => `<link rel="stylesheet" href="${f.rel}">`).join('\n    ');
  const externalCssLinksRemote = externalCssFailed.map(u => `<link rel="stylesheet" href="${u}">`).join('\n    ');
  const externalCssLinks = [externalCssLinksLocal, externalCssLinksRemote].filter(Boolean).join('\n    ');
  const externalJsScripts = externalJsFiles.map(f => `<script src="${f.rel}"></script>`).join('\n    ');

  const bodyClasses = result.theme.rootClasses.filter(c => c.includes('dark') || c.includes('theme'));
  const rewrittenComponentHtml = rewriteHtml(result.element.html);
  const rewrittenBgImage = (result.theme.bodyBackground.backgroundImage && result.theme.bodyBackground.backgroundImage !== 'none')
    ? rewriteCssUrls(result.theme.bodyBackground.backgroundImage)
    : '';

  const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>组件复刻 - ${result.element.tag}</title>
  ${externalCssLinks}
  <link rel="stylesheet" href="css/component.css">
  <style>
    html { color-scheme: ${result.theme.colorScheme || 'light dark'}; }
    body {
      background-color: ${result.theme.bodyBackground.backgroundColor || 'white'};
      ${rewrittenBgImage ? `background-image: ${rewrittenBgImage};` : ''}
      ${result.theme.bodyBackground.backgroundSize ? `background-size: ${result.theme.bodyBackground.backgroundSize};` : ''}
      ${result.theme.bodyBackground.backgroundPosition ? `background-position: ${result.theme.bodyBackground.backgroundPosition};` : ''}
      ${result.theme.bodyBackground.backgroundRepeat ? `background-repeat: ${result.theme.bodyBackground.backgroundRepeat};` : ''}
      margin: 0; padding: 40px; box-sizing: border-box;
    }
  </style>
</head>
<body${bodyClasses.length ? ` class="${bodyClasses.join(' ')}"` : ''}>
  ${rewrittenComponentHtml}
  ${externalJsScripts}
  ${result.js.inline.length ? '<script src="js/inline.js"></script>' : ''}
</body>
</html>`;

  folderRoot.file('index.html', indexHtml);

  // 生成 zip 并下载
  const zipBlob = zip.generateAsync ? await zip.generateAsync({ type: 'blob' }) : await zip.generateBlob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(zipBlob);
  link.download = `component-${safeName(result.element.tag)}.zip`;
  link.click();

  // 汇总输出，减少噪音
  const summary = {
    externalCssSaved: externalCssFiles.length,
    externalCssKeptRemote: externalCssFailed.length,
    externalJsSaved: externalJsFiles.length,
    assetsDownloaded: downloadedAssetHrefs.size,
    assetsSkipped: failedAssets.length
  };
  console.log('✅ ZIP 已生成并开始下载');
  console.log('📊 打包摘要:', summary);
  return { zipGenerated: true, result };
}

// 便捷方法：右上角控制面板
(function mountPanel(){
  if (document.getElementById('extract-zip-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'extract-zip-panel';
  panel.style.cssText = `position:fixed;top:20px;right:20px;background:#111;color:#fff;padding:16px;border-radius:10px;z-index:999999;font-family:system-ui;max-width:360px;box-shadow:0 10px 30px rgba(0,0,0,.3);`;
  panel.innerHTML = `
    <div style="font-weight:700;margin-bottom:10px">📦 组件资源打包器</div>
    <div style="opacity:.8;font-size:13px;margin-bottom:12px">在控制台输入 <code>extractOriginalToZip($0)</code>，或点击下方按钮。</div>
    <button id="btn-extract-zip" style="display:block;width:100%;padding:10px 12px;border:0;border-radius:8px;background:#fff;color:#111;font-weight:700;cursor:pointer">下载 ZIP</button>
    <button id="btn-extract-zip-close" style="display:block;width:100%;padding:8px 12px;border:0;border-radius:8px;background:transparent;color:#fff;margin-top:8px;border:1px solid rgba(255,255,255,.3);cursor:pointer">关闭</button>
  `;
  document.body.appendChild(panel);
  panel.querySelector('#btn-extract-zip').onclick = () => extractOriginalToZip($0).catch(e => alert('打包失败：'+ e.message));
  panel.querySelector('#btn-extract-zip-close').onclick = () => panel.remove();
})();

window.extractOriginalToZip = extractOriginalToZip;

console.log(`\n🎯 组件资源打包器已就绪\n使用：extractOriginalToZip($0)\n`);


