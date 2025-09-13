// 🎯 增强版组件提取器 - 修复资源下载、暗黑模式和ES6模块问题
// 选中元素后在控制台运行：extractOriginalToZip($0)

async function extractOriginalToZip(element) {
  if (!element) {
    console.log("❌ 请先选中元素，然后运行 extractOriginalToZip($0)");
    return;
  }

  console.log("🚀 开始提取并打包 ZIP...");

  // 动态加载 JSZip
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
      this.files = [];
      this.root = new SimpleZipFolder(this, '');
    }
    folder(path) { return this.root.folder(path); }
    file(name, data) { this.root.file(name, data); }
    _addFile(name, data) {
      let bytes;
      if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else if (data instanceof Uint8Array) bytes = data;
      else if (typeof data === 'string') bytes = strToUtf8Bytes(data);
      else {
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
          numToLE(0x04034b50, 4),
          numToLE(20, 2),
          numToLE(0, 2),
          numToLE(0, 2),
          numToLE(0, 2),
          numToLE(0, 2),
          numToLE(crc, 4),
          numToLE(f.bytes.length, 4),
          numToLE(f.bytes.length, 4),
          numToLE(nameBytes.length, 2),
          numToLE(0, 2)
        ];
        const lh = concatBytes(...localHeader, nameBytes);
        chunks.push(lh, f.bytes);
        const localOffset = offset;
        offset += lh.length + f.bytes.length;

        const centralHeader = [
          numToLE(0x02014b50, 4),
          numToLE(20, 2),
          numToLE(20, 2),
          numToLE(0, 2),
          numToLE(0, 2),
          numToLE(0, 2),
          numToLE(0, 2),
          numToLE(crc, 4),
          numToLE(f.bytes.length, 4),
          numToLE(f.bytes.length, 4),
          numToLE(nameBytes.length, 2),
          numToLE(0, 2),
          numToLE(0, 2),
          numToLE(0, 2),
          numToLE(0, 2),
          numToLE(0, 4),
          numToLE(localOffset, 4)
        ];
        const cd = concatBytes(...centralHeader, nameBytes);
        central.push(cd);
      }
      const centralStart = offset;
      for (const cd of central) { chunks.push(cd); offset += cd.length; }
      const centralSize = offset - centralStart;
      const eocd = concatBytes(
        numToLE(0x06054b50, 4),
        numToLE(0, 2),
        numToLE(0, 2),
        numToLE(this.files.length, 2),
        numToLE(this.files.length, 2),
        numToLE(centralSize, 4),
        numToLE(centralStart, 4),
        numToLE(0, 2)
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

  // 改进的 fetch 工具 - 处理各种资源类型
  async function fetchWithPolicy(url, type) {
    try {
      // 处理相对路径和协议
      let finalUrl = url;
      if (url.startsWith('//')) {
        finalUrl = location.protocol + url;
      } else if (url.startsWith('/')) {
        finalUrl = location.origin + url;
      } else if (!url.startsWith('http')) {
        // 相对路径
        const base = location.href.substring(0, location.href.lastIndexOf('/') + 1);
        finalUrl = base + url;
      }
      
      const u = new URL(finalUrl, location.href);
      const isSameOrigin = u.origin === location.origin;
      
      // 尝试不同的凭据策略
      const attempts = [
        { credentials: 'omit', mode: 'cors' },
        ...(isSameOrigin ? [{ credentials: 'same-origin', mode: 'cors' }] : []),
        { credentials: 'include', mode: 'no-cors' }
      ];
      
      let lastErr;
      for (const opts of attempts) {
        try {
          const res = await fetch(u.href, opts);
          if (!res.ok && res.status !== 0) throw new Error(`HTTP ${res.status}`);
          if (type === 'arrayBuffer') return await res.arrayBuffer();
          if (type === 'text') return await res.text();
          return await res.blob();
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error('下载失败');
    } catch (e) {
      console.warn(`无法下载资源: ${url}`, e);
      throw e;
    }
  }
  
  async function fetchArrayBuffer(url) { return await fetchWithPolicy(url, 'arrayBuffer'); }
  async function fetchText(url) { return await fetchWithPolicy(url, 'text'); }

  // 将 URL 解析为标准格式
  function toURL(u) {
    try {
      if (u.startsWith('//')) {
        return new URL(location.protocol + u);
      }
      return new URL(u, location.href);
    } catch {
      return null;
    }
  }

  // 生成安全的文件名
  function safeName(name) {
    // 处理 URL 路径，保留文件扩展名
    const parts = String(name).split('/');
    const fileName = parts[parts.length - 1] || 'file';
    return fileName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  }

  // 收集结果数据
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

  // 增强的主题检测 - 特别关注暗黑模式
  function detectThemeAndBackground() {
    const html = document.documentElement;
    const body = document.body;
    
    // 检测暗黑模式的多种方式
    const isDarkMode = 
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ||
      html.classList.contains('dark') ||
      body.classList.contains('dark') ||
      html.dataset.theme === 'dark' ||
      body.dataset.theme === 'dark' ||
      html.dataset.mode === 'dark' ||
      body.dataset.mode === 'dark';
    
    result.theme.isDark = isDarkMode;
    
    // 收集所有类名
    result.theme.rootClasses = [
      ...Array.from(html.classList),
      ...Array.from(body.classList)
    ];
    
    // 收集 data 属性
    result.theme.dataAttributes = { html: {}, body: {} };
    for (let attr of html.attributes) {
      if (attr.name.startsWith('data-')) {
        result.theme.dataAttributes.html[attr.name] = attr.value;
      }
    }
    for (let attr of body.attributes) {
      if (attr.name.startsWith('data-')) {
        result.theme.dataAttributes.body[attr.name] = attr.value;
      }
    }
    
    // 获取 color-scheme
    result.theme.colorScheme = getComputedStyle(html).colorScheme || getComputedStyle(body).colorScheme || 'light dark';
    
    // 获取背景设置
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

  // 增强的 CSS 提取 - 包含所有暗黑模式相关样式
  function extractRelevantCSS() {
    const relevantRules = new Map();
    const animations = new Map();
    const mediaQueries = new Map();
    const cssVariables = new Map();
    const usedAnimations = new Set();
    const transitions = new Set();
    const allElements = [element, ...element.querySelectorAll('*')];
    
    // 收集动画和过渡
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

    // 提取所有 CSS 变量（特别是暗黑模式相关的）
    const rootStyle = getComputedStyle(document.documentElement);
    for (let i = 0; i < rootStyle.length; i++) {
      const prop = rootStyle[i];
      if (prop.startsWith('--')) {
        cssVariables.set(prop, rootStyle.getPropertyValue(prop));
      }
    }

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
            
            // 扩展匹配规则 - 包含更多暗黑模式相关选择器
            if (selector === 'html' || selector === 'body' || selector === ':root' || selector === '*' ||
                selector.includes('html.') || selector.includes('body.') ||
                selector.includes('[data-theme') || selector.includes('[data-mode') ||
                selector.includes('.dark') || selector.includes('dark-mode') ||
                selector.includes(':root.dark') || selector.includes('html.dark')) {
              matches = true;
            }
            
            // 检查元素匹配
            try {
              if (element.matches(selector) || element.querySelector(selector)) {
                matches = true;
              }
              let parent = element.parentElement;
              while (parent && !matches) {
                if (parent.matches(selector)) matches = true;
                parent = parent.parentElement;
              }
            } catch (e) {
              // 处理复杂选择器
              if (result.element.id && selector.includes('#' + result.element.id)) matches = true;
              result.element.classes.forEach(cls => {
                if (cls && selector.includes('.' + cls)) matches = true;
              });
              if (selector.includes(result.element.tag)) matches = true;
            }
            
            // 伪类和伪元素
            if (selector.includes(':hover') || selector.includes(':focus') || selector.includes(':active') ||
                selector.includes('::before') || selector.includes('::after') ||
                selector.includes(':not') || selector.includes(':has')) {
              const baseSelector = selector.replace(/:(hover|focus|active|before|after|not.*?\)|has.*?\)|:before|:after).*/g, '');
              try {
                if (element.matches(baseSelector) || element.querySelector(baseSelector)) matches = true;
              } catch (e) {}
            }
            
            if (matches) {
              relevantRules.set(selector, {
                cssText: rule.cssText,
                source,
                specificity: calculateSpecificity(selector)
              });
            }
          } else if (rule.type === CSSRule.KEYFRAMES_RULE) {
            if (usedAnimations.has(rule.name)) {
              animations.set(rule.name, rule.cssText);
            }
          } else if (rule.type === CSSRule.MEDIA_RULE) {
            const mediaText = rule.media.mediaText;
            // 特别关注暗黑模式媒体查询
            if (mediaText.includes('prefers-color-scheme') || mediaText.includes('dark')) {
              if (!mediaQueries.has(mediaText)) mediaQueries.set(mediaText, []);
              for (let innerRule of rule.cssRules || []) {
                mediaQueries.get(mediaText).push(innerRule.cssText);
              }
            } else {
              // 其他媒体查询
              if (!mediaQueries.has(mediaText)) mediaQueries.set(mediaText, []);
              for (let innerRule of rule.cssRules || []) {
                if (innerRule.type === CSSRule.STYLE_RULE) {
                  try {
                    if (element.matches(innerRule.selectorText) || 
                        innerRule.selectorText === 'html' || 
                        innerRule.selectorText === 'body' ||
                        innerRule.selectorText === ':root') {
                      mediaQueries.get(mediaText).push(innerRule.cssText);
                    }
                  } catch (e) {}
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('无法访问样式表:', sheet.href, e);
      }
    }

    // 内联样式
    if (element.style.cssText) {
      result.css.inline.push({
        element: element.tagName + (element.id ? '#' + element.id : ''),
        style: element.style.cssText
      });
    }

    result.css.rules = Array.from(relevantRules.values())
      .sort((a, b) => a.specificity - b.specificity)
      .map(r => r.cssText);
    result.css.animations = Array.from(animations.values());
    result.css.transitions = Array.from(transitions);
    result.css.mediaQueries = Array.from(mediaQueries.entries()).map(([media, rules]) => ({ media, rules }));
    result.css.variables = Array.from(cssVariables.entries()).map(([name, value]) => `${name}: ${value}`);
  }

  // 改进的 JavaScript 提取 - 处理 ES6 模块
  function extractJavaScript() {
    document.querySelectorAll('script').forEach(script => {
      if (script.src) {
        result.js.external.push({
          url: script.src,
          type: script.type || 'text/javascript',
          async: script.async,
          defer: script.defer,
          module: script.type === 'module'
        });
      } else if (script.textContent) {
        result.js.inline.push({
          content: script.textContent,
          type: script.type || 'text/javascript',
          module: script.type === 'module'
        });
      }
    });
  }

  // 改进的图片提取
  function extractImages() {
    // <img> 标签
    element.querySelectorAll('img').forEach(img => {
      if (img.src) {
        result.images.push({
          type: 'img',
          src: img.src,
          srcset: img.srcset,
          alt: img.alt,
          width: img.width,
          height: img.height
        });
      }
    });
    
    // <picture> 标签中的源
    element.querySelectorAll('picture source').forEach(source => {
      if (source.srcset) {
        result.images.push({
          type: 'picture-source',
          srcset: source.srcset,
          media: source.media,
          type: source.type
        });
      }
    });
    
    // 背景图片
    const allElements = [element, ...element.querySelectorAll('*')];
    allElements.forEach(el => {
      const bgImage = getComputedStyle(el).backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const urls = bgImage.match(/url\(['"]?([^'"\)]+)['"]?\)/g);
        if (urls) {
          urls.forEach(urlMatch => {
            const url = urlMatch.match(/url\(['"]?([^'"\)]+)['"]?\)/)[1];
            result.images.push({
              type: 'background',
              src: url,
              element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : '')
            });
          });
        }
      }
    });
  }

  function extractFonts() {
    const fonts = new Set();
    for (let sheet of document.styleSheets) {
      try {
        for (let rule of sheet.cssRules || []) {
          if (rule.type === CSSRule.FONT_FACE_RULE) {
            fonts.add(rule.cssText);
          }
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

  // 构建项目结构并打包
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
  const folderImages = folderRoot.folder('images');
  const folderFonts = folderRoot.folder('fonts');

  // 下载外部 CSS
  const externalCssFiles = [];
  const externalCssFailed = [];
  for (const css of result.css.external) {
    const url = toURL(css.url);
    if (!url) continue;
    try {
      const content = await fetchText(url.href);
      const fileName = safeName(url.pathname.split('/').pop()) || 'style.css';
      const relName = `css/${fileName}`;
      externalCssFiles.push({ original: css.url, rel: relName, content, base: url.href });
    } catch (e) {
      console.warn('下载外部 CSS 失败', css.url, e);
      externalCssFailed.push(css.url);
    }
  }

  // 下载外部 JS - 处理 ES6 模块
  const externalJsFiles = [];
  const externalJsFailed = [];
  for (const js of result.js.external) {
    const url = toURL(js.url);
    if (!url) continue;
    try {
      const content = await fetchText(url.href);
      const fileName = safeName(url.pathname.split('/').pop()) || 'script.js';
      const relName = `js/${fileName}`;
      folderJs.file(fileName, content);
      externalJsFiles.push({
        original: js.url,
        rel: relName,
        content,
        module: js.module
      });
    } catch (e) {
      console.warn('下载外部 JS 失败', js.url, e);
      externalJsFailed.push({
        url: js.url,
        module: js.module
      });
    }
  }

  // 收集需要下载的静态资源
  const assetSet = new Map();
  const downloadedAssetHrefs = new Set();
  
  function addAsset(u) {
    if (!u) return;
    const url = toURL(u);
    if (!url) return;
    const key = url.href;
    if (assetSet.has(key)) return;
    const pathname = url.pathname;
    const ext = (pathname.split('.').pop() || '').toLowerCase();
    const fileName = safeName(pathname.split('/').pop()) || 'asset';
    
    // 根据类型分类
    let folder = 'assets';
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
      folder = 'images';
    } else if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) {
      folder = 'fonts';
    }
    
    const rel = `${folder}/${fileName}`;
    assetSet.set(key, { url, rel, ext, folder });
  }

  // 收集所有资源
  result.images.forEach(img => {
    if (img.src) addAsset(img.src);
    if (img.srcset) {
      // 处理 srcset
      img.srcset.split(',').forEach(src => {
        const url = src.trim().split(' ')[0];
        if (url) addAsset(url);
      });
    }
  });

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
  externalCssFiles.forEach(f => collectUrlsFromCss(f.content, f.base).forEach(addAsset));

  // 下载所有静态资源
  const failedAssets = [];
  let downloadCount = 0;
  const totalAssets = assetSet.size;
  
  for (const { url, rel, folder } of assetSet.values()) {
    try {
      console.log(`下载资源 ${++downloadCount}/${totalAssets}: ${url.pathname.split('/').pop()}`);
      const buf = await fetchArrayBuffer(url.href);
      const fileName = rel.split('/').pop();
      
      // 根据文件夹类型写入
      if (folder === 'images') {
        folderImages.file(fileName, buf);
      } else if (folder === 'fonts') {
        folderFonts.file(fileName, buf);
      } else {
        folderAssets.file(fileName, buf);
      }
      
      downloadedAssetHrefs.add(url.href);
    } catch (e) {
      failedAssets.push(url.href);
      console.warn(`资源下载失败: ${url.href}`, e);
    }
  }

  // 重写 CSS 文本中的 url() 为本地路径
  function rewriteCssUrls(cssText, baseHref) {
    return cssText.replace(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g, (m, u) => {
      let abs;
      try {
        if (u.startsWith('//')) {
          abs = location.protocol + u;
        } else {
          abs = new URL(u, baseHref || location.href).href;
        }
      } catch {
        abs = u;
      }
      
      if (downloadedAssetHrefs.has(abs)) {
        const rel = assetSet.get(abs)?.rel || u;
        // 从 css 文件夹到资源文件夹的相对路径
        return `url(../${rel})`;
      }
      return m;
    });
  }

  // 生成本地 CSS 内容（包含所有暗黑模式相关样式）
  const localCssPieces = [];
  
  // CSS 变量
  if (result.css.variables.length) {
    localCssPieces.push(':root {');
    localCssPieces.push(result.css.variables.map(v => '  ' + v + ';').join('\n'));
    localCssPieces.push('}\n');
    
    // 如果是暗黑模式，也添加暗黑模式的变量
    if (result.theme.isDark) {
      localCssPieces.push(':root.dark, [data-theme="dark"] {');
      localCssPieces.push(result.css.variables.map(v => '  ' + v + ';').join('\n'));
      localCssPieces.push('}\n');
    }
  }
  
  localCssPieces.push('/* 基础规则 */');
  localCssPieces.push(result.css.rules.join('\n\n'));
  
  if (result.css.animations.length) {
    localCssPieces.push('\n/* 动画 */');
    localCssPieces.push(result.css.animations.join('\n\n'));
  }
  
  if (result.css.mediaQueries.length) {
    localCssPieces.push('\n/* 媒体查询 */');
    localCssPieces.push(result.css.mediaQueries.map(mq => 
      `@media ${mq.media} {\n${mq.rules.join('\n')}\n}`
    ).join('\n\n'));
  }
  
  const localCss = rewriteCssUrls(localCssPieces.join('\n'));
  folderCss.file('component.css', localCss);

  // 写入外链 CSS（已重写 url）
  for (const f of externalCssFiles) {
    const rewritten = rewriteCssUrls(f.content, f.base);
    const fileName = f.rel.replace('css/', '');
    folderCss.file(fileName, rewritten);
  }

  // 生成本地 JS
  if (result.js.inline.length) {
    // 分离普通脚本和模块脚本
    const normalScripts = result.js.inline.filter(s => !s.module);
    const moduleScripts = result.js.inline.filter(s => s.module);
    
    if (normalScripts.length) {
      const normalJsCombined = normalScripts.map(s => s.content).join('\n\n');
      folderJs.file('inline.js', normalJsCombined);
    }
    
    if (moduleScripts.length) {
      const moduleJsCombined = moduleScripts.map(s => s.content).join('\n\n');
      folderJs.file('inline-module.js', moduleJsCombined);
    }
  }

  // 构建 index.html - 重写外链到本地文件
  function rewriteHtml(html) {
    let out = html;
    
    // 重写资源引用
    for (const { url, rel } of assetSet.values()) {
      if (!downloadedAssetHrefs.has(url.href)) continue;
      const escaped = url.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`([\"\'])${escaped}([\"\'])`, 'g'), `$1${rel}$2`);
    }
    
    return out;
  }

  // 准备 HTML 中的外部资源链接
  const externalCssLinksLocal = externalCssFiles.map(f => 
    `<link rel="stylesheet" href="${f.rel}">`
  ).join('\n    ');
  
  const externalCssLinksRemote = externalCssFailed.map(u => 
    `<!-- 下载失败，保留远程链接 -->\n    <link rel="stylesheet" href="${u}">`
  ).join('\n    ');
  
  const externalCssLinks = [externalCssLinksLocal, externalCssLinksRemote].filter(Boolean).join('\n    ');
  
  // 处理 JS 脚本标签 - 区分普通脚本和 ES6 模块
  const externalJsScripts = externalJsFiles.map(f => 
    f.module 
      ? `<script type="module" src="${f.rel}"></script>`
      : `<script src="${f.rel}"></script>`
  ).join('\n    ');
  
  const externalJsFailedScripts = externalJsFailed.map(f => 
    `<!-- 下载失败，保留远程链接 -->\n    <script${f.module ? ' type="module"' : ''} src="${f.url}"></script>`
  ).join('\n    ');

  // 构建 HTML 类名和属性
  const htmlClasses = result.theme.rootClasses.filter(c => 
    c.includes('dark') || c.includes('theme') || c.includes('mode')
  );
  const bodyClasses = result.theme.rootClasses.filter(c => 
    c.includes('dark') || c.includes('theme') || c.includes('mode')
  );
  
  // 构建 data 属性
  const htmlDataAttrs = Object.entries(result.theme.dataAttributes.html)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const bodyDataAttrs = Object.entries(result.theme.dataAttributes.body)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

  const rewrittenComponentHtml = rewriteHtml(result.element.html);
  const rewrittenBgImage = (result.theme.bodyBackground.backgroundImage && result.theme.bodyBackground.backgroundImage !== 'none')
    ? rewriteCssUrls(result.theme.bodyBackground.backgroundImage)
    : '';

  const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN"${htmlClasses.length ? ` class="${htmlClasses.join(' ')}"` : ''}${htmlDataAttrs ? ' ' + htmlDataAttrs : ''}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>组件复刻 - ${result.element.tag}</title>
  ${externalCssLinks}
  <link rel="stylesheet" href="css/component.css">
  <style>
    /* 主题设置 */
    html { 
      color-scheme: ${result.theme.colorScheme || (result.theme.isDark ? 'dark' : 'light')}; 
    }
    body {
      background-color: ${result.theme.bodyBackground.backgroundColor || (result.theme.isDark ? '#0a0a0a' : 'white')};
      ${rewrittenBgImage ? `background-image: ${rewrittenBgImage};` : ''}
      ${result.theme.bodyBackground.backgroundSize ? `background-size: ${result.theme.bodyBackground.backgroundSize};` : ''}
      ${result.theme.bodyBackground.backgroundPosition ? `background-position: ${result.theme.bodyBackground.backgroundPosition};` : ''}
      ${result.theme.bodyBackground.backgroundRepeat ? `background-repeat: ${result.theme.bodyBackground.backgroundRepeat};` : ''}
      margin: 0; 
      padding: 40px; 
      box-sizing: border-box;
      min-height: 100vh;
    }
    
    /* 确保暗黑模式生效 */
    ${result.theme.isDark ? `
    @media (prefers-color-scheme: dark) {
      body {
        background-color: ${result.theme.bodyBackground.backgroundColor || '#0a0a0a'};
      }
    }
    ` : ''}
  </style>
</head>
<body${bodyClasses.length ? ` class="${bodyClasses.join(' ')}"` : ''}${bodyDataAttrs ? ' ' + bodyDataAttrs : ''}>
  <div class="component-container">
    ${rewrittenComponentHtml}
  </div>
  
  ${externalJsScripts}
  ${externalJsFailedScripts}
  ${result.js.inline.filter(s => !s.module).length ? '<script src="js/inline.js"></script>' : ''}
  ${result.js.inline.filter(s => s.module).length ? '<script type="module" src="js/inline-module.js"></script>' : ''}
</body>
</html>`;

  folderRoot.file('index.html', indexHtml);

  // 添加 README 文件
  const readmeContent = `# 组件提取结果

## 组件信息
- 标签: ${result.element.tag}
- ID: ${result.element.id || '无'}
- 类名: ${result.element.classes.join(', ') || '无'}
- 主题: ${result.theme.isDark ? '暗黑模式' : '明亮模式'}

## 文件结构
- \`index.html\` - 主页面
- \`css/\` - 样式文件
  - \`component.css\` - 组件样式
  - 外部 CSS 文件
- \`js/\` - JavaScript 文件
  - \`inline.js\` - 内联脚本
  - \`inline-module.js\` - ES6 模块脚本
  - 外部 JS 文件
- \`images/\` - 图片资源
- \`fonts/\` - 字体文件
- \`assets/\` - 其他资源

## 资源统计
- 外部 CSS 成功下载: ${externalCssFiles.length}
- 外部 CSS 下载失败: ${externalCssFailed.length}
- 外部 JS 成功下载: ${externalJsFiles.length}
- 外部 JS 下载失败: ${externalJsFailed.length}
- 静态资源成功下载: ${downloadedAssetHrefs.size}
- 静态资源下载失败: ${failedAssets.length}

## 注意事项
1. 部分资源可能因跨域限制无法下载，已保留原始链接
2. ES6 模块脚本已使用 type="module" 标记
3. 暗黑模式样式已保留

生成时间: ${new Date().toLocaleString()}
`;

  folderRoot.file('README.md', readmeContent);

  // 生成 ZIP 并下载
  const zipBlob = zip.generateAsync 
    ? await zip.generateAsync({ type: 'blob' }) 
    : await zip.generateBlob();
    
  const link = document.createElement('a');
  link.href = URL.createObjectURL(zipBlob);
  link.download = `component-${safeName(result.element.tag)}-${Date.now()}.zip`;
  link.click();

  // 汇总输出
  const summary = {
    theme: result.theme.isDark ? '暗黑模式' : '明亮模式',
    externalCssSaved: externalCssFiles.length,
    externalCssKeptRemote: externalCssFailed.length,
    externalJsSaved: externalJsFiles.length,
    externalJsKeptRemote: externalJsFailed.length,
    assetsDownloaded: downloadedAssetHrefs.size,
    assetsSkipped: failedAssets.length,
    cssRules: result.css.rules.length,
    cssVariables: result.css.variables.length,
    animations: result.css.animations.length,
    mediaQueries: result.css.mediaQueries.length
  };
  
  console.log('✅ ZIP 已生成并开始下载');
  console.log('📊 打包摘要:', summary);
  
  if (failedAssets.length > 0) {
    console.log('⚠️ 以下资源下载失败:', failedAssets);
  }
  
  return { zipGenerated: true, result, summary };
}

// 注册到全局
window.extractOriginalToZip = extractOriginalToZip;

console.log(`
🎯 增强版组件资源打包器已就绪
✨ 特性：
  - 自动检测并保留暗黑模式样式
  - 智能处理 ES6 模块和普通脚本
  - 改进的资源下载（处理相对路径和跨域）
  - 分类整理资源（images/fonts/assets）
  - 生成项目说明文档

使用方法：
1. 在 DevTools 中选中要提取的元素
2. 在控制台运行: extractOriginalToZip($0)
`);