# UI 快速参考卡片

## 🎨 色彩系统

### 品牌色
```css
var(--acid)       /* oklch(0.72 0.17 118) - 酸性黄绿 */
var(--hot)        /* oklch(0.6 0.24 355) - 荧光洋红 */
var(--acid-soft)  /* 透明度 12% 的酸性色背景 */
```

### 语义色
```css
var(--foreground)       /* 主文本 */
var(--muted-foreground) /* 辅助文本 */
var(--background)       /* 页面背景 */
var(--card)             /* 卡片背景 */
var(--border)           /* 边框 */
var(--ring)             /* 聚焦环 */
```

---

## 📏 间距与圆角

### Tailwind 类
```html
p-4      <!-- 1rem / 16px -->
gap-3    <!-- 0.75rem / 12px -->
rounded-xl   <!-- 0.75rem -->
rounded-3xl  <!-- 1.5rem -->
```

### CSS 变量
```css
var(--radius)      /* 0.5rem - 基础圆角 */
var(--radius-lg)   /* 0.5rem - 大圆角 */
var(--radius-2xl)  /* 0.9rem - 超大圆角 */
```

---

## 🔤 字体系统

### 字阶变量
```css
var(--text-xs)    /* 11px - 标签 */
var(--text-sm)    /* 13px - 正文小 */
var(--text-base)  /* 15px - 正文 */
var(--text-lg)    /* 17px - 小标题 */
var(--text-xl)    /* 20px - 卡片标题 */
var(--text-2xl)   /* 28px - 章节标题 */
var(--text-3xl)   /* clamp(2rem, 4vw, 3.2rem) - Hero */
```

### 行高变量
```css
var(--leading-tight)    /* 1.1 - 标题 */
var(--leading-snug)     /* 1.4 - 小标题 */
var(--leading-normal)   /* 1.65 - 正文 */
var(--leading-relaxed)  /* 1.8 - 长文 */
```

---

## ⏱️ 动效系统

### 时长
```css
var(--duration-fast)  /* 150ms - 交互反馈 */
var(--duration-base)  /* 280ms - 标准过渡 */
var(--duration-slow)  /* 450ms - 入场动画 */
```

### 缓动曲线
```css
var(--ease-smooth)  /* cubic-bezier(0.2, 0.8, 0.2, 1) - 流畅 */
var(--ease-bounce)  /* cubic-bezier(0.68, -0.55, 0.27, 1.55) - 弹簧 */
```

### 标准写法
```css
transition: 
    border-color var(--duration-base) var(--ease-smooth),
    box-shadow var(--duration-base) var(--ease-smooth);
```

---

## 🎭 朋克装饰类

### 核心类
```html
<div class="punk-panel">         <!-- 分层面板 -->
<div class="punk-card">          <!-- 普通卡片 -->
<div class="punk-card-loud">     <!-- 营销卡片 -->
<div class="punk-rule">          <!-- 分隔线 -->
<span class="eyebrow">           <!-- 小标签 -->
<span class="chip">              <!-- 胶囊标签 -->
<span class="chip-acid">         <!-- 酸性色胶囊 -->
```

### 装饰效果
```html
<div class="neon-ring">          <!-- 霓虹描边 -->
<div class="neon-glow">          <!-- 背光 -->
<div class="brackets">           <!-- 四角准星 -->
<span class="punk-signal">       <!-- 信号点 -->
```

### Lite 变体
```html
<div class="punk-lite">
    <!-- 在此容器内所有朋克装饰自动精简 -->
</div>
```

---

## 📦 常用组合

### 标准卡片
```html
<div class="punk-card rounded-xl border border-border bg-card/60 p-5">
    <h3 class="text-sm font-medium">标题</h3>
    <p class="mt-1.5 text-xs text-muted-foreground">描述文本</p>
</div>
```

### 页面容器
```html
<div class="page-shell">
    <!-- 自动响应式边距 max-w-1240px -->
</div>
```

### 小标签 + 标题
```html
<span class="eyebrow">分类标签</span>
<h2 class="mt-4 text-2xl font-semibold">页面标题</h2>
```

### 错峰入场动画
```html
{items.map((item, index) => (
    <div 
        key={item.id}
        className="enter-up"
        style={{ "--enter-index": index } as CSSProperties}
    >
        {item.content}
    </div>
))}
```

---

## 🎯 阴影等级

### 卡片阴影
```css
/* 低 - 悬浮感 */
box-shadow: 0 1px 2px oklch(0 0 0 / 8%);

/* 中 - 标准卡片 */
box-shadow: 
    0 1px 0 oklch(0 0 0 / 5%),
    0 16px 36px -30px oklch(0 0 0 / 90%);

/* 高 - 模态框 */
box-shadow:
    inset 0 1px 0 var(--glass-highlight),
    0 48px 96px -48px oklch(0 0 0 / 85%);
```

---

## 🔧 实用工具类

### 滚动条
```html
<div class="hide-scrollbar">      <!-- 完全隐藏 -->
<div class="thin-scrollbar">      <!-- 细滚动条 -->
<div class="hover-scrollbar">     <!-- 悬停显示 -->
```

### 玻璃效果
```html
<div class="glass-panel rounded-2xl backdrop-blur-md">
    <!-- 自带玻璃高光和阴影 -->
</div>
```

---

## 📱 响应式断点

```css
/* Tailwind 默认断点 */
sm:   /* @media (min-width: 640px) */
md:   /* @media (min-width: 768px) */
lg:   /* @media (min-width: 1024px) */
xl:   /* @media (min-width: 1280px) */
2xl:  /* @media (min-width: 1536px) */
```

### 移动端优先示例
```html
<div class="p-4 sm:p-6 lg:p-8">
    <!-- 移动 16px，平板 24px，桌面 32px -->
</div>
```

---

## ⚠️ 避免事项

### ❌ 不推荐
```css
/* 硬编码过渡 */
transition: all 0.3s ease;

/* 未定义字号 */
font-size: 29px;

/* 触发重排的动画 */
animation: slide 1s;
@keyframes slide {
    to { top: 100px; }
}
```

### ✅ 推荐
```css
/* 使用变量 */
transition: all var(--duration-base) var(--ease-smooth);

/* 使用字阶 */
font-size: var(--text-2xl);

/* 使用 transform */
animation: slide 1s;
@keyframes slide {
    to { transform: translateY(100px); }
}
```

---

## 🚀 快速调试

### Chrome DevTools
```javascript
// 查看 CSS 变量
getComputedStyle(document.documentElement).getPropertyValue('--acid')

// 修改变量测试
document.documentElement.style.setProperty('--acid', 'oklch(0.8 0.2 120)')
```

### 性能检查
1. 打开 DevTools → Performance
2. 录制 6 秒交互
3. 查看 FPS 是否稳定在 60

---

**打印提示**: 此文档适合打印贴在显示器旁作为快速参考 📌
