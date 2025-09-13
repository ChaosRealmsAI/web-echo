// 🚀 增强版网页元素资源提取器 V2 - 修复动画加载问题
// 选中元素后运行: extractEnhanced($0)

function extractEnhanced(element) {
  if (!element) {
    console.log("❌ 请先选中元素，然后运行 extractEnhanced($0)");
    return;
  }

  console.log("🚀 开始提取资源 V2...");
  
  const result = {
    element: {
      tag: element.tagName.toLowerCase(),
      id: element.id,
      classes: Array.from(element.classList),
      html: element.outerHTML
    },
    theme: {
      isDark: false,
      colorScheme: '',
      bodyBackground: {}
    },
    css: {
      rules: [],
      animations: [],
      transitions: [],
      variables: [],
      mediaQueries: []
    },
    stats: {
      totalRules: 0,
      totalAnimations: 0,
      totalTransitions: 0,
      totalVariables: 0,
      totalMediaQueries: 0
    }
  };

  // ========== 1. 检测主题和背景 ==========
  function detectTheme() {
    const html = document.documentElement;
    const body = document.body;
    
    // 检测暗黑模式
    result.theme.isDark = 
      window.matchMedia('(prefers-color-scheme: dark)').matches ||
      html.classList.contains('dark') ||
      html.classList.contains('dark-theme') ||
      body.classList.contains('dark') ||
      body.classList.contains('dark-theme');
    
    // 获取color-scheme
    result.theme.colorScheme = 
      getComputedStyle(html).colorScheme || 
      getComputedStyle(body).colorScheme || 
      'light';
    
    // 获取背景样式
    const bodyStyle = getComputedStyle(body);
    result.theme.bodyBackground = {
      backgroundColor: bodyStyle.backgroundColor,
      backgroundImage: bodyStyle.backgroundImage,
      backgroundSize: bodyStyle.backgroundSize,
      backgroundPosition: bodyStyle.backgroundPosition,
      backgroundRepeat: bodyStyle.backgroundRepeat
    };
  }

  // ========== 2. 提取所有CSS变量 ==========
  function extractCSSVariables() {
    const vars = new Map();
    
    // 从:root和html提取
    for (let sheet of document.styleSheets) {
      try {
        for (let rule of sheet.cssRules || []) {
          if (rule.selectorText === ':root' || 
              rule.selectorText === 'html' || 
              rule.selectorText === 'body') {
            const style = rule.style;
            for (let i = 0; i < style.length; i++) {
              const prop = style[i];
              if (prop.startsWith('--')) {
                vars.set(prop, style.getPropertyValue(prop));
              }
            }
          }
        }
      } catch(e) {}
    }
    
    // 从computed style提取
    const rootStyle = getComputedStyle(document.documentElement);
    for (let prop of rootStyle) {
      if (prop.startsWith('--')) {
        vars.set(prop, rootStyle.getPropertyValue(prop));
      }
    }
    
    result.css.variables = Array.from(vars.entries())
      .map(([name, value]) => `${name}: ${value}`);
    
    result.stats.totalVariables = result.css.variables.length;
  }

  // ========== 3. 强制提取所有动画 ==========
  function extractAllAnimations() {
    const animations = new Map();
    
    for (let sheet of document.styleSheets) {
      try {
        function extractFromRules(rules) {
          for (let rule of rules || []) {
            // 提取所有@keyframes，不管是否被使用
            if (rule.type === CSSRule.KEYFRAMES_RULE) {
              animations.set(rule.name, rule.cssText);
            }
            // 递归检查媒体查询内的规则
            else if (rule.type === CSSRule.MEDIA_RULE) {
              extractFromRules(rule.cssRules);
            }
            // 检查@supports内的规则
            else if (rule.type === CSSRule.SUPPORTS_RULE) {
              extractFromRules(rule.cssRules);
            }
          }
        }
        extractFromRules(sheet.cssRules);
      } catch(e) {
        console.warn('无法访问样式表:', sheet.href, e);
      }
    }
    
    result.css.animations = Array.from(animations.values());
    result.stats.totalAnimations = animations.size;
  }

  // ========== 4. 宽松的CSS规则匹配 ==========
  function extractRelevantCSS() {
    const rules = new Map();
    const transitions = [];
    
    // 获取所有相关元素
    const allElements = [element, ...element.querySelectorAll('*')];
    const elementClasses = new Set();
    const elementIds = new Set();
    const elementTags = new Set();
    
    allElements.forEach(el => {
      if (el.id) elementIds.add(el.id);
      if (el.className) {
        const classes = typeof el.className === 'string' ? 
          el.className.split(' ') : [];
        classes.forEach(c => elementClasses.add(c));
      }
      elementTags.add(el.tagName.toLowerCase());
    });
    
    for (let sheet of document.styleSheets) {
      try {
        for (let rule of sheet.cssRules || []) {
          if (rule.type === CSSRule.STYLE_RULE) {
            const selector = rule.selectorText;
            let isRelevant = false;
            
            // 1. 全局和主题相关选择器
            const globalSelectors = [
              '*', 'html', 'body', ':root', '[data-', '[class', 
              '.dark', '.light', '.theme'
            ];
            if (globalSelectors.some(s => selector.includes(s))) {
              isRelevant = true;
            }
            
            // 2. 检查是否包含我们的类名、ID或标签
            if (!isRelevant) {
              // 检查类名
              for (let cls of elementClasses) {
                if (cls && selector.includes(`.${cls}`)) {
                  isRelevant = true;
                  break;
                }
              }
              
              // 检查ID
              for (let id of elementIds) {
                if (id && selector.includes(`#${id}`)) {
                  isRelevant = true;
                  break;
                }
              }
              
              // 检查标签名
              for (let tag of elementTags) {
                if (selector.includes(tag)) {
                  isRelevant = true;
                  break;
                }
              }
            }
            
            // 3. 尝试matches（包括伪类）
            if (!isRelevant) {
              try {
                if (element.matches(selector)) {
                  isRelevant = true;
                } else {
                  // 移除伪类后再试
                  const base = selector.replace(/:hover|:focus|:active|::before|::after/g, '');
                  if (base !== selector && element.matches(base)) {
                    isRelevant = true;
                  }
                }
              } catch(e) {}
            }
            
            if (isRelevant) {
              rules.set(selector, rule.cssText);
              
              // 同时收集过渡效果
              if (rule.style.transition && rule.style.transition !== 'none') {
                transitions.push({
                  selector: selector,
                  transition: rule.style.transition
                });
              }
            }
          }
        }
      } catch(e) {}
    }
    
    result.css.rules = Array.from(rules.values());
    result.css.transitions = transitions;
    result.stats.totalRules = rules.size;
    result.stats.totalTransitions = transitions.length;
  }

  // ========== 5. 提取媒体查询 ==========
  function extractMediaQueries() {
    const mediaQueries = new Map();
    
    for (let sheet of document.styleSheets) {
      try {
        for (let rule of sheet.cssRules || []) {
          if (rule.type === CSSRule.MEDIA_RULE) {
            const media = rule.media.mediaText;
            const innerRules = [];
            
            // 收集媒体查询内的所有规则
            for (let innerRule of rule.cssRules || []) {
              // 总是包含主题相关的媒体查询
              if (media.includes('prefers-color-scheme')) {
                innerRules.push(innerRule.cssText);
              } else {
                // 其他媒体查询检查相关性
                if (innerRule.type === CSSRule.STYLE_RULE) {
                  try {
                    if (element.matches(innerRule.selectorText)) {
                      innerRules.push(innerRule.cssText);
                    }
                  } catch(e) {}
                }
              }
            }
            
            if (innerRules.length > 0) {
              if (!mediaQueries.has(media)) {
                mediaQueries.set(media, []);
              }
              mediaQueries.get(media).push(...innerRules);
            }
          }
        }
      } catch(e) {}
    }
    
    result.css.mediaQueries = Array.from(mediaQueries.entries()).map(([media, rules]) => ({
      media,
      rules
    }));
    result.stats.totalMediaQueries = mediaQueries.size;
  }

  // ========== 执行所有提取 ==========
  detectTheme();
  extractCSSVariables();
  extractAllAnimations();  // 强制提取所有动画
  extractRelevantCSS();
  extractMediaQueries();

  // ========== 生成HTML文件 ==========
  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN"${result.theme.isDark ? ' class="dark-theme"' : ''}>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>组件复刻 - ${result.element.tag}</title>
    
    <!-- 主题设置 -->
    <style>
        html {
            color-scheme: ${result.theme.colorScheme};
        }
        
        body {
            background-color: ${result.theme.bodyBackground.backgroundColor};
            ${result.theme.bodyBackground.backgroundImage !== 'none' ? 
              `background-image: ${result.theme.bodyBackground.backgroundImage};` : ''}
            background-size: ${result.theme.bodyBackground.backgroundSize};
            background-position: ${result.theme.bodyBackground.backgroundPosition};
            background-repeat: ${result.theme.bodyBackground.backgroundRepeat};
            margin: 0;
            padding: 50px;
        }
    </style>
    
    <!-- CSS变量 (${result.stats.totalVariables}个) -->
    <style>
        :root {
${result.css.variables.map(v => '            ' + v + ';').join('\n')}
        }
    </style>
    
    <!-- CSS规则 (${result.stats.totalRules}条) -->
    <style>
${result.css.rules.join('\n\n')}
    </style>
    
    <!-- 动画定义 (${result.stats.totalAnimations}个) -->
    ${result.css.animations.length > 0 ? `<style>
/* 所有@keyframes动画 */
${result.css.animations.join('\n\n')}
    </style>` : ''}
    
    <!-- 过渡效果 (${result.stats.totalTransitions}个) -->
    ${result.css.transitions.length > 0 ? `<style>
/* 过渡效果 */
${result.css.transitions.map(t => 
  `/* ${t.selector} { transition: ${t.transition}; } */`
).join('\n')}
    </style>` : ''}
    
    <!-- 媒体查询 (${result.stats.totalMediaQueries}个) -->
    ${result.css.mediaQueries.length > 0 ? `<style>
${result.css.mediaQueries.map(mq => 
  `@media ${mq.media} {\n${mq.rules.join('\n')}\n}`
).join('\n\n')}
    </style>` : ''}
</head>
<body${result.theme.isDark ? ' class="dark-theme"' : ''}>
    <!-- 原始组件 -->
    ${result.element.html}
    
    <!-- 统计信息 -->
    <div style="margin-top: 50px; padding: 20px; background: rgba(0,0,0,0.1); border-radius: 8px; font-family: monospace;">
        <h3>📊 提取统计 V2</h3>
        <ul>
            <li>🌙 主题: ${result.theme.isDark ? '暗黑模式' : '亮色模式'}</li>
            <li>🎨 背景色: ${result.theme.bodyBackground.backgroundColor}</li>
            <li>📝 CSS规则: ${result.stats.totalRules} 条</li>
            <li>🎭 CSS变量: ${result.stats.totalVariables} 个</li>
            <li style="color: #4caf50; font-weight: bold;">🎬 动画(@keyframes): ${result.stats.totalAnimations} 个</li>
            <li>✨ 过渡效果: ${result.stats.totalTransitions} 个</li>
            <li>📱 媒体查询: ${result.stats.totalMediaQueries} 个</li>
        </ul>
        
        ${result.css.animations.length > 0 ? `
        <h4>🎬 提取的动画列表：</h4>
        <ul>
${result.css.animations.map(anim => {
  const name = anim.match(/@keyframes\s+([^\s{]+)/)?.[1] || 'unknown';
  return `            <li>${name}</li>`;
}).join('\n')}
        </ul>` : ''}
    </div>
</body>
</html>`;

  // 创建下载面板
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
    <h3 style="margin: 0 0 20px 0;">✅ 资源提取完成 V2</h3>
    
    <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
        <div>🌙 主题: ${result.theme.isDark ? '暗黑' : '亮色'}</div>
        <div>📝 CSS规则: ${result.stats.totalRules}</div>
        <div>🎭 CSS变量: ${result.stats.totalVariables}</div>
        <div style="color: #4caf50; font-weight: bold;">🎬 动画: ${result.stats.totalAnimations}</div>
        <div>✨ 过渡: ${result.stats.totalTransitions}</div>
        <div>📱 媒体查询: ${result.stats.totalMediaQueries}</div>
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
    ">📥 下载HTML文件</button>
    
    <button id="copy-css" style="
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
    ">📋 复制CSS代码</button>
    
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
    
    ${result.stats.totalAnimations === 0 ? 
      '<p style="color: #ffeb3b; font-size: 12px; margin-top: 10px;">⚠️ 未检测到动画，可能需要检查原页面</p>' : 
      '<p style="color: #4caf50; font-size: 12px; margin-top: 10px;">✅ 成功提取所有动画！</p>'}
  `;
  
  document.body.appendChild(panel);
  
  // 绑定事件
  panel.querySelector('#download-html').onclick = () => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `component-${result.element.tag}-enhanced-v2.html`;
    link.click();
    console.log('✅ HTML文件已下载');
  };
  
  panel.querySelector('#copy-css').onclick = () => {
    const cssContent = [
      '/* CSS变量 */',
      ':root {',
      result.css.variables.map(v => '  ' + v + ';').join('\n'),
      '}',
      '',
      '/* CSS规则 */',
      result.css.rules.join('\n\n'),
      '',
      '/* 动画 */',
      result.css.animations.join('\n\n'),
      '',
      '/* 媒体查询 */',
      result.css.mediaQueries.map(mq => 
        `@media ${mq.media} {\n${mq.rules.join('\n')}\n}`
      ).join('\n\n')
    ].join('\n');
    
    navigator.clipboard.writeText(cssContent).then(() => {
      alert('CSS代码已复制到剪贴板！');
    });
  };
  
  panel.querySelector('#close-panel').onclick = () => {
    panel.remove();
  };
  
  console.log('✅ 提取完成！查看右上角面板');
  console.log('📊 统计:', result.stats);
  
  return result;
}

// 注册到全局
window.extractEnhanced = extractEnhanced;

console.log(`
🚀 增强版提取器 V2 已加载

使用方法：
1. 在开发者工具中选中要提取的元素
2. 在控制台运行: extractEnhanced($0)

改进内容：
✅ 强制提取所有@keyframes动画
✅ 更宽松的CSS选择器匹配
✅ 完整提取CSS变量
✅ 改进的过渡效果检测
✅ 更清晰的统计信息

特别优化：
🎬 修复动画加载问题 - 现在会提取所有动画，不管是否被使用
📝 更智能的规则匹配 - 包含更多相关样式
🎨 完整的主题支持 - 自动检测暗黑模式
`);