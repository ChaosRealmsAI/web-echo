// 🎯 增强版原始资源提取器 - 支持暗黑模式和动画
// 选中元素后运行 extractOriginal($0)

function extractOriginal(element) {
  if (!element) {
    console.log("❌ 请先选中元素，然后运行 extractOriginal($0)");
    return;
  }

  console.log("🚀 开始提取原始资源...");
  
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
      transitions: []
    },
    js: {
      inline: [],
      external: [],
      eventHandlers: []
    },
    images: [],
    fonts: []
  };

  // ========== 0. 检测并提取主题/背景色信息 ==========
  console.log("🌙 检测主题和背景色...");
  
  function detectThemeAndBackground() {
    // 检测暗黑模式
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    result.theme.isDark = isDarkMode;
    
    // 获取HTML和BODY的类名和属性
    const html = document.documentElement;
    const body = document.body;
    
    result.theme.rootClasses = [
      ...Array.from(html.classList),
      ...Array.from(body.classList)
    ];
    
    // 获取data属性
    result.theme.dataAttributes = {
      html: {},
      body: {}
    };
    
    // 收集HTML的data属性
    for (let attr of html.attributes) {
      if (attr.name.startsWith('data-')) {
        result.theme.dataAttributes.html[attr.name] = attr.value;
      }
    }
    
    // 收集BODY的data属性
    for (let attr of body.attributes) {
      if (attr.name.startsWith('data-')) {
        result.theme.dataAttributes.body[attr.name] = attr.value;
      }
    }
    
    // 获取color-scheme
    result.theme.colorScheme = getComputedStyle(html).colorScheme || getComputedStyle(body).colorScheme || '';
    
    // 获取背景色
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
    
    console.log(`✅ 主题检测: ${isDarkMode ? '暗黑模式' : '亮色模式'}`);
    console.log(`✅ 背景色: ${result.theme.bodyBackground.backgroundColor}`);
  }

  // ========== 1. 提取相关的原始CSS规则（增强版） ==========
  console.log("🎨 提取原始CSS规则...");
  
  function extractRelevantCSS() {
    const relevantRules = new Map();
    const animations = new Map();
    const mediaQueries = new Map();
    const cssVariables = new Map();
    const usedAnimations = new Set();
    const transitions = new Set();
    
    // 首先，收集元素及其子元素使用的动画名称和过渡属性
    const allElements = [element, ...element.querySelectorAll('*')];
    allElements.forEach(el => {
      const style = getComputedStyle(el);
      
      // 收集动画名称
      if (style.animationName && style.animationName !== 'none') {
        style.animationName.split(',').forEach(name => {
          usedAnimations.add(name.trim());
        });
      }
      
      // 收集过渡属性
      if (style.transition && style.transition !== 'none') {
        transitions.add({
          element: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className : ''),
          transition: style.transition
        });
      }
    });
    
    // 遍历所有样式表
    for (let sheet of document.styleSheets) {
      try {
        // 记录样式表来源
        const source = sheet.href || 'inline-style';
        
        if (sheet.href) {
          result.css.external.push({
            url: sheet.href,
            rules: []
          });
        }
        
        // 遍历所有CSS规则
        for (let rule of sheet.cssRules || sheet.rules || []) {
          // 处理普通样式规则
          if (rule.type === CSSRule.STYLE_RULE) {
            const selector = rule.selectorText;
            
            // 检查选择器是否可能匹配我们的元素或其父元素
            let matches = false;
            
            // 检查是否是html或body的规则（用于主题）
            if (selector === 'html' || selector === 'body' || 
                selector === ':root' || selector === '*' ||
                selector.includes('html.') || selector.includes('body.') ||
                selector.includes('[data-theme') || selector.includes('[data-mode')) {
              matches = true;
            }
            
            try {
              // 检查是否直接匹配元素
              if (element.matches(selector)) {
                matches = true;
              }
              // 检查是否匹配父元素（用于继承的样式）
              let parent = element.parentElement;
              while (parent && !matches) {
                if (parent.matches(selector)) {
                  matches = true;
                }
                parent = parent.parentElement;
              }
            } catch (e) {
              // 备用方法：检查选择器文本
              if (result.element.id && selector.includes('#' + result.element.id)) {
                matches = true;
              }
              
              result.element.classes.forEach(cls => {
                if (cls && selector.includes('.' + cls)) {
                  matches = true;
                }
              });
              
              if (selector.includes(result.element.tag)) {
                matches = true;
              }
            }
            
            // 检查伪类和伪元素
            if (selector.includes(':hover') || 
                selector.includes(':focus') || 
                selector.includes(':active') ||
                selector.includes('::before') || 
                selector.includes('::after')) {
              
              const baseSelector = selector.replace(/:(hover|focus|active|before|after|:before|:after).*/g, '');
              try {
                if (element.matches(baseSelector)) {
                  matches = true;
                }
              } catch (e) {
                result.element.classes.forEach(cls => {
                  if (cls && baseSelector.includes('.' + cls)) {
                    matches = true;
                  }
                });
              }
            }
            
            if (matches) {
              relevantRules.set(selector, {
                cssText: rule.cssText,
                source: source,
                specificity: calculateSpecificity(selector)
              });
            }
          }
          
          // 提取@keyframes动画（只提取被使用的）
          else if (rule.type === CSSRule.KEYFRAMES_RULE) {
            if (usedAnimations.has(rule.name)) {
              animations.set(rule.name, rule.cssText);
            }
          }
          
          // 提取媒体查询（特别是暗黑模式相关的）
          else if (rule.type === CSSRule.MEDIA_RULE) {
            const mediaText = rule.media.mediaText;
            
            // 总是包含暗黑模式相关的媒体查询
            if (mediaText.includes('prefers-color-scheme')) {
              if (!mediaQueries.has(mediaText)) {
                mediaQueries.set(mediaText, []);
              }
              
              // 提取所有暗黑模式规则
              for (let innerRule of rule.cssRules || []) {
                if (innerRule.type === CSSRule.STYLE_RULE) {
                  // 包含html, body, :root的规则
                  if (innerRule.selectorText === 'html' || 
                      innerRule.selectorText === 'body' || 
                      innerRule.selectorText === ':root' ||
                      innerRule.selectorText === '*') {
                    mediaQueries.get(mediaText).push(innerRule.cssText);
                  }
                  // 或者匹配我们的元素
                  try {
                    if (element.matches(innerRule.selectorText)) {
                      mediaQueries.get(mediaText).push(innerRule.cssText);
                    }
                  } catch (e) {}
                }
              }
            } else {
              // 其他媒体查询
              if (!mediaQueries.has(mediaText)) {
                mediaQueries.set(mediaText, []);
              }
              
              for (let innerRule of rule.cssRules || []) {
                if (innerRule.type === CSSRule.STYLE_RULE) {
                  try {
                    if (element.matches(innerRule.selectorText)) {
                      mediaQueries.get(mediaText).push(innerRule.cssText);
                    }
                  } catch (e) {}
                }
              }
            }
          }
          
          // 提取CSS变量（从:root和html）
          else if (rule.type === CSSRule.STYLE_RULE && 
                   (rule.selectorText === ':root' || rule.selectorText === 'html')) {
            const style = rule.style;
            for (let i = 0; i < style.length; i++) {
              const prop = style[i];
              if (prop.startsWith('--')) {
                cssVariables.set(prop, style.getPropertyValue(prop));
              }
            }
          }
        }
      } catch (e) {
        console.warn('无法访问样式表:', sheet.href, e);
      }
    }
    
    // 检查内联样式
    if (element.style.cssText) {
      result.css.inline.push({
        element: element.tagName + (element.id ? '#' + element.id : ''),
        style: element.style.cssText
      });
    }
    
    // 组装结果
    result.css.rules = Array.from(relevantRules.values())
      .sort((a, b) => a.specificity - b.specificity)
      .map(r => r.cssText);
    
    result.css.animations = Array.from(animations.values());
    result.css.transitions = Array.from(transitions);
    result.css.mediaQueries = Array.from(mediaQueries.entries()).map(([media, rules]) => ({
      media,
      rules
    }));
    result.css.variables = Array.from(cssVariables.entries()).map(([name, value]) => `${name}: ${value}`);
    
    console.log(`✅ 找到 ${result.css.rules.length} 条相关CSS规则`);
    console.log(`✅ 找到 ${animations.size} 个动画定义`);
    console.log(`✅ 找到 ${transitions.size} 个过渡效果`);
    console.log(`✅ 找到 ${cssVariables.size} 个CSS变量`);
  }
  
  // 计算选择器特异性（简化版）
  function calculateSpecificity(selector) {
    const ids = (selector.match(/#/g) || []).length;
    const classes = (selector.match(/\./g) || []).length;
    const tags = (selector.match(/^[a-z]+|[\s>+~][a-z]+/gi) || []).length;
    return ids * 100 + classes * 10 + tags;
  }

  // ========== 2. 提取相关JavaScript ==========
  console.log("📜 提取JavaScript...");
  
  function extractJavaScript() {
    // 获取所有脚本标签
    document.querySelectorAll('script').forEach(script => {
      if (script.src) {
        result.js.external.push({
          url: script.src,
          type: script.type || 'text/javascript',
          async: script.async,
          defer: script.defer
        });
      } else if (script.textContent) {
        result.js.inline.push({
          content: script.textContent.substring(0, 1000) + '...', // 限制长度
          type: script.type || 'text/javascript'
        });
      }
    });
    
    // 检查事件监听器
    if (typeof getEventListeners !== 'undefined') {
      try {
        const listeners = getEventListeners(element);
        Object.keys(listeners).forEach(eventType => {
          result.js.eventHandlers.push({
            type: eventType,
            count: listeners[eventType].length,
            handlers: listeners[eventType].map(l => ({
              useCapture: l.useCapture,
              passive: l.passive,
              once: l.once
            }))
          });
        });
      } catch (e) {}
    }
    
    // 检查内联事件处理器
    ['onclick', 'onmouseover', 'onmouseout', 'onchange', 'onfocus', 'onblur'].forEach(event => {
      if (element[event]) {
        result.js.eventHandlers.push({
          type: event,
          inline: true,
          handler: element[event].toString().substring(0, 200) + '...'
        });
      }
    });
    
    console.log(`✅ 找到 ${result.js.external.length} 个外部JS文件`);
    console.log(`✅ 找到 ${result.js.eventHandlers.length} 个事件处理器`);
  }

  // ========== 3. 提取图片资源 ==========
  console.log("🖼️ 提取图片资源...");
  
  function extractImages() {
    // 检查img标签
    element.querySelectorAll('img').forEach(img => {
      if (img.src) {
        result.images.push({
          type: 'img',
          src: img.src,
          alt: img.alt,
          width: img.width,
          height: img.height
        });
      }
    });
    
    // 检查背景图片
    const allElements = [element, ...element.querySelectorAll('*')];
    allElements.forEach(el => {
      const bgImage = getComputedStyle(el).backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const urlMatch = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (urlMatch) {
          result.images.push({
            type: 'background',
            src: urlMatch[1],
            element: el.tagName + (el.className ? '.' + el.className : '')
          });
        }
      }
    });
    
    console.log(`✅ 找到 ${result.images.length} 个图片资源`);
  }

  // ========== 4. 提取字体 ==========
  console.log("🔤 提取字体...");
  
  function extractFonts() {
    const fonts = new Set();
    
    // 从@font-face规则提取
    for (let sheet of document.styleSheets) {
      try {
        for (let rule of sheet.cssRules || []) {
          if (rule.type === CSSRule.FONT_FACE_RULE) {
            fonts.add(rule.cssText);
          }
        }
      } catch (e) {}
    }
    
    // 检查元素使用的字体
    const allElements = [element, ...element.querySelectorAll('*')];
    allElements.forEach(el => {
      const fontFamily = getComputedStyle(el).fontFamily;
      if (fontFamily) {
        fonts.add(fontFamily);
      }
    });
    
    result.fonts = Array.from(fonts);
    console.log(`✅ 找到 ${result.fonts.length} 个字体定义`);
  }

  // 执行所有提取
  detectThemeAndBackground();
  extractRelevantCSS();
  extractJavaScript();
  extractImages();
  extractFonts();

  // ========== 生成完整的HTML文件 ==========
  console.log("📦 生成可下载文件...");
  
  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN"${result.theme.rootClasses.length > 0 ? ` class="${result.theme.rootClasses.filter(c => c.includes('dark') || c.includes('theme')).join(' ')}"` : ''}${Object.keys(result.theme.dataAttributes.html).map(key => ` ${key}="${result.theme.dataAttributes.html[key]}"`).join('')}>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>组件复刻 - ${result.element.tag}</title>
    
    <!-- 主题和背景设置 -->
    <style>
        /* 保留原始的主题设置 */
        html {
            color-scheme: ${result.theme.colorScheme || 'light dark'};
        }
        
        body {
            background-color: ${result.theme.bodyBackground.backgroundColor || 'white'};
            ${result.theme.bodyBackground.backgroundImage !== 'none' && result.theme.bodyBackground.backgroundImage ? `background-image: ${result.theme.bodyBackground.backgroundImage};` : ''}
            ${result.theme.bodyBackground.backgroundSize ? `background-size: ${result.theme.bodyBackground.backgroundSize};` : ''}
            ${result.theme.bodyBackground.backgroundPosition ? `background-position: ${result.theme.bodyBackground.backgroundPosition};` : ''}
            ${result.theme.bodyBackground.backgroundRepeat ? `background-repeat: ${result.theme.bodyBackground.backgroundRepeat};` : ''}
            margin: 0;
            padding: 50px;
        }
    </style>
    
    <!-- CSS变量 -->
    <style>
        :root {
${result.css.variables.map(v => '            ' + v + ';').join('\n')}
        }
    </style>
    
    <!-- 相关CSS规则 -->
    <style>
${result.css.rules.join('\n\n')}
    </style>
    
    <!-- 动画定义 -->
    ${result.css.animations.length > 0 ? `<style>
/* 动画定义 */
${result.css.animations.join('\n\n')}
    </style>` : ''}
    
    <!-- 过渡效果 -->
    ${result.css.transitions.length > 0 ? `<style>
/* 过渡效果 */
${result.css.transitions.map(t => `/* ${t.element}: ${t.transition} */`).join('\n')}
    </style>` : ''}
    
    <!-- 媒体查询（包括暗黑模式） -->
    <style>
${result.css.mediaQueries.map(mq => 
  `@media ${mq.media} {\n${mq.rules.join('\n')}\n}`
).join('\n\n')}
    </style>
    
    <!-- 外部CSS引用 -->
${result.css.external.map(css => 
  `    <link rel="stylesheet" href="${css.url}">`
).join('\n')}
    
    <!-- 外部JS引用 -->
${result.js.external.map(js => 
  `    <script src="${js.url}"${js.async ? ' async' : ''}${js.defer ? ' defer' : ''}></script>`
).join('\n')}
</head>
<body${result.theme.rootClasses.filter(c => c.includes('dark') || c.includes('theme')).length > 0 ? ` class="${result.theme.rootClasses.filter(c => c.includes('dark') || c.includes('theme')).join(' ')}"` : ''}${Object.keys(result.theme.dataAttributes.body).map(key => ` ${key}="${result.theme.dataAttributes.body[key]}"`).join('')}>
    <!-- 原始组件HTML -->
    ${result.element.html}
    
    <!-- 调试信息 -->
    <div style="margin-top: 50px; padding: 20px; background: rgba(0,0,0,0.05); border-radius: 8px;">
        <h3>📊 提取统计</h3>
        <ul>
            <li>🌙 主题: ${result.theme.isDark ? '暗黑模式' : '亮色模式'}</li>
            <li>🎨 背景色: ${result.theme.bodyBackground.backgroundColor}</li>
            <li>📝 CSS规则: ${result.css.rules.length} 条</li>
            <li>🎭 CSS变量: ${result.css.variables.length} 个</li>
            <li>🎬 动画: ${result.css.animations.length} 个</li>
            <li>✨ 过渡效果: ${result.css.transitions.length} 个</li>
            <li>📱 媒体查询: ${result.css.mediaQueries.length} 个</li>
            <li>🖼️ 图片资源: ${result.images.length} 个</li>
            <li>⚡ 事件处理器: ${result.js.eventHandlers.length} 个</li>
        </ul>
        
        ${result.images.length > 0 ? `<h3>🖼️ 图片资源列表</h3>
        <ul>
${result.images.map(img => 
  `            <li><a href="${img.src}" target="_blank">${img.src}</a></li>`
).join('\n')}
        </ul>` : ''}
        
        ${result.css.animations.length > 0 ? `<h3>🎬 动画列表</h3>
        <ul>
${result.css.animations.map(anim => {
  const name = anim.match(/@keyframes\s+([^\s{]+)/)?.[1] || 'unknown';
  return `            <li>${name}</li>`;
}).join('\n')}
        </ul>` : ''}
    </div>
</body>
</html>`;

  // 创建下载按钮
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 25px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    z-index: 999999;
    font-family: system-ui;
    max-width: 400px;
  `;
  
  panel.innerHTML = `
    <h3 style="margin: 0 0 20px 0;">✅ 原始资源提取完成</h3>
    
    <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
        <div>🌙 主题: ${result.theme.isDark ? '暗黑' : '亮色'}</div>
        <div>🎨 背景: ${result.theme.bodyBackground.backgroundColor ? '已提取' : '默认'}</div>
        <div>📝 CSS规则: ${result.css.rules.length}</div>
        <div>🎭 CSS变量: ${result.css.variables.length}</div>
        <div>🎬 动画: ${result.css.animations.length}</div>
        <div>✨ 过渡: ${result.css.transitions.length}</div>
        <div>📱 媒体查询: ${result.css.mediaQueries.length}</div>
        <div>🖼️ 图片: ${result.images.length}</div>
      </div>
    </div>
    
    <button id="download-html" style="
      display: block;
      width: 100%;
      padding: 12px;
      margin: 10px 0;
      background: white;
      color: #667eea;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    ">📥 下载完整HTML（包含原始CSS）</button>
    
    <button id="download-css" style="
      display: block;
      width: 100%;
      padding: 12px;
      margin: 10px 0;
      background: rgba(255,255,255,0.2);
      color: white;
      border: 2px solid white;
      border-radius: 6px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    ">📄 仅下载CSS规则</button>
    
    <button id="copy-result" style="
      display: block;
      width: 100%;
      padding: 12px;
      margin: 10px 0;
      background: rgba(255,255,255,0.2);
      color: white;
      border: 2px solid white;
      border-radius: 6px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    ">📋 复制提取结果JSON</button>
    
    <button id="close-panel" style="
      display: block;
      width: 100%;
      padding: 10px;
      margin: 10px 0;
      background: rgba(0,0,0,0.2);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    ">关闭</button>
  `;
  
  document.body.appendChild(panel);
  
  // 绑定事件
  panel.querySelector('#download-html').onclick = () => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `component-${result.element.tag}-original.html`;
    link.click();
    console.log('✅ HTML文件已下载');
  };
  
  panel.querySelector('#download-css').onclick = () => {
    const cssContent = [
      '/* CSS变量 */',
      ':root {',
      result.css.variables.map(v => '  ' + v + ';').join('\n'),
      '}',
      '',
      '/* 主题背景 */',
      `body { background-color: ${result.theme.bodyBackground.backgroundColor}; }`,
      '',
      '/* CSS规则 */',
      result.css.rules.join('\n\n'),
      '',
      '/* 动画定义 */',
      result.css.animations.join('\n\n'),
      '',
      '/* 媒体查询 */',
      result.css.mediaQueries.map(mq => 
        `@media ${mq.media} {\n${mq.rules.join('\n')}\n}`
      ).join('\n\n')
    ].join('\n');
    
    const blob = new Blob([cssContent], { type: 'text/css' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `component-${result.element.tag}.css`;
    link.click();
    console.log('✅ CSS文件已下载');
  };
  
  panel.querySelector('#copy-result').onclick = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2)).then(() => {
      console.log('✅ 结果已复制到剪贴板');
      alert('提取结果已复制到剪贴板！');
    });
  };
  
  panel.querySelector('#close-panel').onclick = () => {
    panel.remove();
  };
  
  console.log('✅ 提取完成！查看右上角面板');
  return result;
}

console.log(`
🎯 增强版原始资源提取器

使用方法：
extractOriginal($0)

新增功能：
🌙 完整提取暗黑模式样式
🎨 自动检测并保留背景色
🎬 智能提取使用中的动画
✨ 提取过渡效果
📱 完整保留响应式规则

特点：
✅ 自动检测主题模式
✅ 提取html/body的背景和主题类
✅ 保留data-theme等属性
✅ 只提取实际使用的动画
✅ 完整保留媒体查询

现在可以完美复刻暗黑模式和动画效果！🚀
`);

window.extractOriginal = extractOriginal;