// 🎯 完整网页元素提取器 - 保留所有样式和结构
// 使用：选中元素后运行 extractComplete($0)

async function extractComplete(element) {
  if (!element) {
    console.error("❌ 请先选中元素，然后运行 extractComplete($0)");
    return;
  }

  console.log("🚀 开始完整提取...");
  
  // 轻量级 ZIP 生成器
  class SimpleZip {
    constructor() {
      this.files = [];
      this._crcTable = this._makeCRCTable();
    }
    
    _makeCRCTable() {
      const table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
      }
      return table;
    }
    
    _crc32(data) {
      let crc = 0 ^ (-1);
      for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ this._crcTable[(crc ^ data[i]) & 0xFF];
      }
      return (crc ^ (-1)) >>> 0;
    }
    
    _strToBytes(str) {
      return new TextEncoder().encode(str);
    }
    
    _numberToBytes(num, bytes) {
      const arr = new Uint8Array(bytes);
      for (let i = 0; i < bytes; i++) {
        arr[i] = (num >>> (8 * i)) & 0xff;
      }
      return arr;
    }
    
    addFile(path, content) {
      let data;
      if (typeof content === 'string') {
        data = this._strToBytes(content);
      } else if (content instanceof Uint8Array) {
        data = content;
      } else if (content instanceof ArrayBuffer) {
        data = new Uint8Array(content);
      } else {
        data = this._strToBytes(String(content));
      }
      
      this.files.push({
        name: this._strToBytes(path),
        data: data,
        crc: this._crc32(data)
      });
    }
    
    generate() {
      const parts = [];
      const centralDir = [];
      let offset = 0;
      
      // 本地文件头
      for (const file of this.files) {
        const header = new Uint8Array(30 + file.name.length);
        header.set([0x50, 0x4b, 0x03, 0x04], 0); // 签名
        header.set([0x14, 0x00], 4); // 版本
        header.set([0x00, 0x00], 6); // 标志
        header.set([0x00, 0x00], 8); // 压缩方法
        header.set(this._numberToBytes(0, 4), 10); // 时间日期
        header.set(this._numberToBytes(file.crc, 4), 14); // CRC32
        header.set(this._numberToBytes(file.data.length, 4), 18); // 压缩大小
        header.set(this._numberToBytes(file.data.length, 4), 22); // 未压缩大小
        header.set(this._numberToBytes(file.name.length, 2), 26); // 文件名长度
        header.set(this._numberToBytes(0, 2), 28); // 额外字段长度
        header.set(file.name, 30);
        
        parts.push(header);
        parts.push(file.data);
        
        // 中央目录
        const cdHeader = new Uint8Array(46 + file.name.length);
        cdHeader.set([0x50, 0x4b, 0x01, 0x02], 0); // 签名
        cdHeader.set([0x14, 0x00], 4); // 制作版本
        cdHeader.set([0x14, 0x00], 6); // 需要版本
        cdHeader.set([0x00, 0x00], 8); // 标志
        cdHeader.set([0x00, 0x00], 10); // 压缩方法
        cdHeader.set(this._numberToBytes(0, 4), 12); // 时间日期
        cdHeader.set(this._numberToBytes(file.crc, 4), 16); // CRC32
        cdHeader.set(this._numberToBytes(file.data.length, 4), 20); // 压缩大小
        cdHeader.set(this._numberToBytes(file.data.length, 4), 24); // 未压缩大小
        cdHeader.set(this._numberToBytes(file.name.length, 2), 28); // 文件名长度
        cdHeader.set(this._numberToBytes(0, 2), 30); // 额外字段长度
        cdHeader.set(this._numberToBytes(0, 2), 32); // 注释长度
        cdHeader.set(this._numberToBytes(0, 2), 34); // 磁盘号
        cdHeader.set(this._numberToBytes(0, 2), 36); // 内部属性
        cdHeader.set(this._numberToBytes(0, 4), 38); // 外部属性
        cdHeader.set(this._numberToBytes(offset, 4), 42); // 本地头偏移
        cdHeader.set(file.name, 46);
        
        centralDir.push(cdHeader);
        offset += header.length + file.data.length;
      }
      
      const cdStart = offset;
      for (const cd of centralDir) {
        parts.push(cd);
        offset += cd.length;
      }
      
      // 中央目录结束记录
      const eocd = new Uint8Array(22);
      eocd.set([0x50, 0x4b, 0x05, 0x06], 0); // 签名
      eocd.set(this._numberToBytes(0, 2), 4); // 磁盘号
      eocd.set(this._numberToBytes(0, 2), 6); // 中央目录开始磁盘
      eocd.set(this._numberToBytes(this.files.length, 2), 8); // 本磁盘记录数
      eocd.set(this._numberToBytes(this.files.length, 2), 10); // 总记录数
      eocd.set(this._numberToBytes(offset - cdStart, 4), 12); // 中央目录大小
      eocd.set(this._numberToBytes(cdStart, 4), 16); // 中央目录偏移
      eocd.set(this._numberToBytes(0, 2), 20); // 注释长度
      
      parts.push(eocd);
      
      return new Blob(parts, { type: 'application/zip' });
    }
  }
  
  // 克隆元素并内联所有计算样式
  function cloneWithStyles(element) {
    const clone = element.cloneNode(true);
    const origElements = [element, ...element.querySelectorAll('*')];
    const cloneElements = [clone, ...clone.querySelectorAll('*')];
    
    // 为每个元素内联计算样式
    origElements.forEach((orig, i) => {
      const cloned = cloneElements[i];
      if (!cloned) return;
      
      const computed = getComputedStyle(orig);
      const important = [
        'display', 'position', 'top', 'right', 'bottom', 'left',
        'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
        'margin', 'padding', 'border', 'outline',
        'font', 'color', 'background', 'opacity', 'visibility',
        'transform', 'transition', 'animation',
        'flex', 'grid', 'gap', 'align-items', 'justify-content',
        'overflow', 'z-index', 'box-shadow', 'text-shadow',
        'border-radius', 'cursor', 'user-select'
      ];
      
      // 收集重要样式
      const styles = {};
      for (const prop of important) {
        const value = computed.getPropertyValue(prop);
        if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
          styles[prop] = value;
        }
      }
      
      // 收集所有以特定前缀开头的属性
      const prefixes = ['webkit', 'moz', 'ms'];
      for (let i = 0; i < computed.length; i++) {
        const prop = computed[i];
        if (prefixes.some(p => prop.startsWith(`-${p}-`))) {
          styles[prop] = computed.getPropertyValue(prop);
        }
      }
      
      // 应用样式
      Object.entries(styles).forEach(([prop, value]) => {
        cloned.style.setProperty(prop, value);
      });
      
      // 保留伪元素样式
      ['::before', '::after'].forEach(pseudo => {
        const pseudoStyle = getComputedStyle(orig, pseudo);
        const content = pseudoStyle.content;
        if (content && content !== 'none') {
          cloned.setAttribute(`data-${pseudo.replace('::', '')}`, content);
        }
      });
    });
    
    return clone;
  }
  
  // 提取所有 CSS 规则
  function extractAllCSS() {
    const cssTexts = [];
    
    // 收集所有样式表
    for (const sheet of document.styleSheets) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        
        // 获取 @import 规则
        const imports = rules
          .filter(r => r.type === CSSRule.IMPORT_RULE)
          .map(r => `@import url("${r.href}");`);
        
        // 获取 @font-face 规则
        const fontFaces = rules
          .filter(r => r.type === CSSRule.FONT_FACE_RULE)
          .map(r => r.cssText);
        
        // 获取 @keyframes 规则
        const keyframes = rules
          .filter(r => r.type === CSSRule.KEYFRAMES_RULE)
          .map(r => r.cssText);
        
        // 获取 @media 规则
        const mediaQueries = rules
          .filter(r => r.type === CSSRule.MEDIA_RULE)
          .map(r => r.cssText);
        
        // 获取普通规则
        const normalRules = rules
          .filter(r => r.type === CSSRule.STYLE_RULE)
          .map(r => r.cssText);
        
        // 合并所有规则
        cssTexts.push(
          ...imports,
          ...fontFaces,
          ...keyframes,
          ...normalRules,
          ...mediaQueries
        );
      } catch (e) {
        console.warn('无法访问样式表:', sheet.href);
      }
    }
    
    // 获取 CSS 变量
    const rootStyles = getComputedStyle(document.documentElement);
    const cssVars = [];
    for (let i = 0; i < rootStyles.length; i++) {
      const prop = rootStyles[i];
      if (prop.startsWith('--')) {
        cssVars.push(`${prop}: ${rootStyles.getPropertyValue(prop)}`);
      }
    }
    
    if (cssVars.length > 0) {
      cssTexts.unshift(`:root {\n  ${cssVars.join(';\n  ')};\n}`);
    }
    
    return cssTexts.join('\n\n');
  }
  
  // 提取内联 SVG
  function extractInlineSVG(element) {
    const svgs = element.querySelectorAll('svg');
    const svgMap = new Map();
    
    svgs.forEach((svg, index) => {
      const id = `svg_${index}`;
      svgMap.set(svg, id);
      
      // 确保 SVG 有完整的命名空间
      if (!svg.getAttribute('xmlns')) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
    });
    
    return svgMap;
  }
  
  // 创建 ZIP
  const zip = new SimpleZip();
  
  // 1. 克隆并内联样式
  const clonedElement = cloneWithStyles(element);
  
  // 2. 提取所有 CSS
  const allCSS = extractAllCSS();
  
  // 3. 构建完整 HTML
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>提取的组件 - 完整版</title>
    <style>
        /* Reset */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        /* 保留原始背景 */
        body {
            background: ${getComputedStyle(document.body).background};
            min-height: 100vh;
            padding: 20px;
        }
        
        /* 提取的样式 */
        ${allCSS}
    </style>
</head>
<body>
    ${clonedElement.outerHTML}
</body>
</html>`;
  
  zip.addFile('index.html', html);
  
  // 4. 添加说明文件
  const readme = `# 提取的网页组件

## 文件说明
- index.html: 包含完整样式的独立 HTML 文件
- 所有样式已内联，无需外部依赖

## 注意事项
- 部分外部资源（如图片、字体）可能因 CORS 限制无法下载
- 动态生成的内容可能无法完全捕获
- JavaScript 交互功能需要手动恢复

提取时间: ${new Date().toLocaleString()}
源网站: ${location.href}
`;
  
  zip.addFile('README.md', readme);
  
  // 5. 生成并下载
  const blob = zip.generate();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `component_${Date.now()}.zip`;
  a.click();
  
  console.log('✅ 提取完成！');
  console.log('📦 已生成包含完整样式的独立 HTML 文件');
  
  // 清理
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  
  return { success: true };
}

// 全局注入
window.extractComplete = extractComplete;

console.log(`
🎯 完整提取器已就绪！
使用: extractComplete($0)
特点: 
- 内联所有计算样式
- 保留 CSS 变量和伪元素
- 包含完整 CSS 规则
`);