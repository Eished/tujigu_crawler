# 图集谷多线程爬虫 tujigu crawler 

> 仅作学习用，侵删。

## 功能介绍：

1. 多线程可调
2. 自动重试：
   1. 超时自动重传
   2. 错误自动重传
3. 下载：
   1. 总进度显示
   2. 单文件夹进度显示
   3. 时间戳显示
   4. 下载完成显示
4. 断点续传（可选）
5. 自动建立文件夹并分类下载
6. 异常文件名处理

## 运行环境：

`Node.js v12.13.1`

## 安装方法：

1. `git clone git@github.com:Eished/tujigu_crawler.git `
2. `npm install`

## 必要的配置：

1. 先手动新建好储存路径路径！

```js
const limitNum = 2; // 请求并发数
const ms = 5000; // 错误重试间隔时间
const m_time = 120000; //超时时间
const reNum = 3000; // 重试次数
const depositPath = "F:/download/"; // 储存路径，先手动新建好路径！

// 下载页面
const address = [
  ["文件夹名1",
    [
      "下载的页面1",
      "下载的页面2"
    ]
  ],
  ["文件夹名2",
    [
      "下载的页面1",
      "下载的页面2"
    ]
  ]
]
```

## 开始执行：

`node index.js`

