// 🎯 完整但精简的组件信息提取器
// 提取所有必要信息：HTML、样式、颜色、交互、响应式，但过滤掉冗余内容

function extractCompleteComponentInfo(element) {
    if (!element) {
      console.log("❌ 请先在Elements面板中选中目标元素，然后运行 extractCompleteComponentInfo($0)");
      return;
    }
  
    console.log("🚀 开始提取完整组件信息（精简版）...\n");
    
    // 克隆并清理页面
    const targetElement = element.cloneNode(true);
    document.body.innerHTML = '';
    document.body.appendChild(targetElement);
    const cleanElement = document.body.firstElementChild;
  
    const result = {
      html: cleanElement.outerHTML,
      cssVariables: {},
      colorScheme: {},
      layoutStyles: {},
      childStyles: {},
      responsiveClasses: new Set(),
      interactionClasses: new Set(),
      animations: {},
      fonts: new Set()
    };
  
    // 1. 提取CSS变量
    const rootStyle = getComputedStyle(document.documentElement);
    for (let i = 0; i < rootStyle.length; i++) {
      const prop = rootStyle[i];
      if (prop.startsWith('--')) {
        const value = rootStyle.getPropertyValue(prop).trim();
        if (value) {
          result.cssVariables[prop] = value;
        }
      }
    }
  
    // 2. 提取颜色方案
    const colorProperties = ['color', 'background-color', 'border-color', 'fill', 'stroke', 'box-shadow'];
    const allElements = [cleanElement, ...cleanElement.querySelectorAll('*')];
    
    allElements.forEach((el, index) => {
      const computed = getComputedStyle(el);
      
      colorProperties.forEach(prop => {
        const value = computed.getPropertyValue(prop);
        if (value && 
            value !== 'rgba(0, 0, 0, 0)' && 
            value !== 'rgb(0, 0, 0)' && 
            value !== 'transparent' &&
            value !== 'none' &&
            !value.includes('0px 0px 0px')) {
          
          if (!result.colorScheme[value]) {
            result.colorScheme[value] = {
              count: 0,
              properties: new Set(),
              elements: []
            };
          }
          
          result.colorScheme[value].count++;
          result.colorScheme[value].properties.add(prop);
          
          if (result.colorScheme[value].elements.length < 3) {
            result.colorScheme[value].elements.push({
              tagName: el.tagName,
              className: el.className || '',
              property: prop
            });
          }
        }
      });
    });
  
    // 3. 提取主要布局样式（过滤掉默认值）
    const layoutProperties = [
      'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
      'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'gap',
      'grid', 'grid-template-columns', 'grid-template-rows',
      'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
      'margin', 'padding', 'border', 'border-radius',
      'background', 'background-color', 'color',
      'font-family', 'font-size', 'font-weight', 'line-height', 'text-align',
      'box-shadow', 'opacity', 'transform', 'transition',
      'overflow', 'cursor'
    ];
  
    const mainComputed = getComputedStyle(cleanElement);
    const defaultValues = new Set([
      'none', 'auto', 'normal', 'initial', 'inherit', 'unset',
      '0px', 'rgba(0, 0, 0, 0)', 'transparent', 'visible', 'static'
    ]);
  
    layoutProperties.forEach(prop => {
      const value = mainComputed.getPropertyValue(prop);
      if (value && !defaultValues.has(value) && value.trim() !== '') {
        // 特殊处理一些属性
        if (prop === 'margin' && value === '0px') return;
        if (prop === 'padding' && value === '0px') return;
        if (prop === 'border' && value.includes('0px')) return;
        
        result.layoutStyles[prop] = value;
      }
    });
  
    // 4. 提取关键子元素样式
    const importantSelectors = new Map();
    allElements.forEach((el, index) => {
      if (el === cleanElement) return;
      
      const computed = getComputedStyle(el);
      let className = '';
      
      if (el.className && typeof el.className === 'string') {
        className = el.className;
      } else if (el.className && el.className.baseVal) {
        className = el.className.baseVal;
      }
      
      // 只保存有重要样式的元素
      const importantStyles = {};
      layoutProperties.forEach(prop => {
        const value = computed.getPropertyValue(prop);
        if (value && !defaultValues.has(value) && value.trim() !== '') {
          // 过滤一些明显的默认值
          if (prop === 'color' && value === 'rgb(0, 0, 0)') return;
          if (prop === 'background-color' && value === 'rgba(0, 0, 0, 0)') return;
          if (prop === 'border' && value.includes('0px')) return;
          
          importantStyles[prop] = value;
        }
      });
      
      if (Object.keys(importantStyles).length > 3) { // 只保存有足够样式的元素
        const selector = className ? 
          `.${className.split(' ').filter(c => c.trim()).slice(0, 3).join('.')}` : 
          `${el.tagName.toLowerCase()}-${index}`;
        
        if (!importantSelectors.has(selector)) {
          importantSelectors.set(selector, importantStyles);
        }
      }
    });
  
    result.childStyles = Object.fromEntries(importantSelectors);
  
    // 5. 收集响应式、交互和动画类名
    allElements.forEach(el => {
      if (el.className && typeof el.className === 'string') {
        el.className.split(' ').forEach(cls => {
          // 响应式类
          if (cls.match(/^(sm|md|lg|xl|2xl):/)) {
            result.responsiveClasses.add(cls);
          }
          // 交互类
          if (cls.match(/^(hover|focus|active|disabled|group-hover):/)) {
            result.interactionClasses.add(cls);
          }
          // 动画类
          if (cls.match(/^(animate-|transition)/)) {
            result.animations[cls] = 'animation-class';
          }
        });
      }
      
      // 检查字体
      const fontFamily = getComputedStyle(el).fontFamily;
      if (fontFamily && fontFamily !== 'initial') {
        result.fonts.add(fontFamily);
      }
    });
  
    // 6. 生成完整报告
    let report = `
  # 🎯 完整组件复刻信息包
  
  ## 📋 HTML结构
  \`\`\`html
  ${result.html}
  \`\`\`
  
  ## 🎨 CSS变量定义
  \`\`\`css
  :root {
  ${Object.entries(result.cssVariables).map(([key, value]) => `  ${key}: ${value};`).join('\n')}
  }
  \`\`\`
  
  ## 🌈 颜色方案
  \`\`\`css
  /* 主要颜色及用途分析 */
  ${Object.entries(result.colorScheme)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([color, info]) => {
      const props = Array.from(info.properties).join(', ');
      return `${color}; /* ${props} - 使用${info.count}次 */`;
    }).join('\n')}
  \`\`\`
  
  ## 💻 主容器样式
  \`\`\`css
  .main-component {
  ${Object.entries(result.layoutStyles).map(([key, value]) => `  ${key}: ${value};`).join('\n')}
  }
  \`\`\`
  
  ## 🧩 关键子元素样式
  \`\`\`css
  ${Object.entries(result.childStyles).map(([selector, styles]) => 
    `${selector} {\n${Object.entries(styles).map(([key, value]) => `  ${key}: ${value};`).join('\n')}\n}`
  ).join('\n\n')}
  \`\`\`
  
  ## 📱 响应式断点
  \`\`\`css
  /* 需要实现的响应式类 */
  ${Array.from(result.responsiveClasses).sort().join('\n')}
  \`\`\`
  
  ## ⚡ 交互效果
  \`\`\`css
  /* 需要实现的交互状态 */
  ${Array.from(result.interactionClasses).sort().join('\n')}
  \`\`\`
  
  ## 🎭 动画效果
  \`\`\`css
  /* 动画和过渡类 */
  ${Object.keys(result.animations).join('\n')}
  \`\`\`
  
  ## 🔤 字体族
  \`\`\`css
  ${Array.from(result.fonts).map(font => `font-family: ${font};`).join('\n')}
  \`\`\`
  
  ## 🎯 实用的颜色变量建议
  \`\`\`css
  :root {
    /* 根据使用频率和功能推荐的变量命名 */
  ${Object.entries(result.colorScheme)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([color, info], index) => {
      const isText = Array.from(info.properties).includes('color');
      const isBg = Array.from(info.properties).includes('background-color');
      const isBorder = Array.from(info.properties).includes('border-color');
      
      let varName = '';
      if (isText) varName = index === 0 ? '--text-primary' : '--text-secondary';
      else if (isBg) varName = '--bg-surface';
      else if (isBorder) varName = '--border-default';
      else varName = '--color-' + (index + 1);
      
      return '  ' + varName + ': ' + color + ';';
    }).join('\n')}
  }
  \`\`\`
  
  ## 🔧 复刻要点
  1. **布局系统**: 主要使用Flexbox布局，注意justify-content和align-items
  2. **颜色系统**: 基于上述变量建立统一的颜色体系
  3. **响应式**: 实现lg:、md:等断点的显示/隐藏逻辑
  4. **交互状态**: 重点实现hover和focus状态的视觉反馈
  5. **字体系统**: 使用Circular字体，设置合适的fallback
  6. **间距系统**: 注意padding、margin、gap的精确值
  7. **过渡动画**: 为交互状态添加smooth transition
  
  ## 📝 给开发者的建议
  - 优先实现布局结构，再添加样式细节
  - 使用CSS变量管理颜色，便于主题切换
  - 考虑无障碍访问，保证颜色对比度
  - 测试不同屏幕尺寸的响应式效果
  - 验证所有交互状态的视觉反馈


  ------

# v0 组件编写核心原则

1. 纯 UI & 无副作用  
只做 UI 渲染；不含业务逻辑、数据获取、API 调用、路由跳转。

2. 首选 shadcn/ui + Tailwind  
优先使用 shadcn/ui 组件与设计 token；其余样式用 Tailwind 工具类。

3. 零额外依赖  
除 shadcn/ui、Tailwind 外不引入第三方包和状态管理库。

4. 简单数据结构 + 无状态  
全部数据通过 props 传入；组件自身不使用 React hooks。交互仅通过 props 回调向外传递。

5. TypeScript 类型明确  
Props 必须拥有显式类型、默认值；变体使用联合类型。遵循公司接口命名/结构规范，并为每个 prop 添加 JSDoc 注释。

6. 职责单一 + 可组合  
一个组件完成一个 UI 任务；复杂功能通过组合实现。

7. 样式标准化  
仅使用 Tailwind 工具类与 shadcn/ui token；避免内联样式或复杂的 CSS-in-JS。

8. 输出格式固定  
仅返回单个 \`tsx\` 代码块（含 import / export），文件即组件，无额外说明文字或 Markdown。

9. 命名统一  
组件名使用 \`PascalCase\`；CSS 类名或前缀使用 \`kebab-case\`，推荐统一添加 \`v0-\` 前缀。

10. 可访问性  
使用语义化 HTML、\`aria-*\` 属性或 \`role\`；交互元素必须支持键盘操作。

11. 响应式适配  
组件在 \`sm\`/\`md\`/\`lg\` 断点下表现良好；必要时通过 Props 暴露 \`size\` 或 \`breakpoint\` 配置。

12. JSDoc 注释  
为 props、回调函数和变体选项添加简短 JSDoc，方便自动生成文档。

13. 亮 / 暗主题兼容  
theme 作为参数传递   theme?: "light" | "dark"

# 工作流

1. 根据【v0 组件编写核心原则】以及【用户需求】编写组件
2. 组件编写完成后， 定义组件名称和对应文件夹， 展示在组件列表中
3. 在两个  左侧导航栏 tab中展示不同主题  例如： 
    - 【基础组件/xx组件-Light】  
    - 【基础组件/xx组件-Dark】


----

现在请根据【工作流】 执行任务。 

# 用户需求

- 根据上述内容， 一比一复刻该页面组件
 


  `;
  
    console.log(report);
    return { report, data: result };
  }
  
  // 使用说明
  console.log(`
  🎯 完整但精简的组件信息提取器
  
  📖 功能特点：
  ✅ 提取HTML结构
  ✅ 分析颜色方案和用途  
  ✅ 获取关键布局样式（过滤默认值）
  ✅ 识别重要子元素样式
  ✅ 收集响应式断点
  ✅ 提取交互状态类
  ✅ 发现动画效果
  ✅ 分析字体使用
  ✅ 提供实用变量建议
  
  📋 使用方法：
  1. 选中目标组件
  2. 运行: extractCompleteComponentInfo($0)
  3. 获得完整而精简的复刻信息
  
  🎯 这次是真正的"完整组件信息提取器"！
  `);
  
  // 导出函数
  window.extractCompleteComponentInfo = extractCompleteComponentInfo;