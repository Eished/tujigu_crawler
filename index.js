const {
  newFile,
  download_url
} = require("./download");
const async = require("async");
const cheerio = require('cheerio');
const rp = require("request-promise");
const pLimit = require('p-limit');
const {
  address,
  limitNum,
  ms,
  reNum,
  depositPath
} = require("./config")
const sd = require('silly-datetime');


const limit = pLimit(limitNum); // 图片下载并发数


// 请求首页数据
async function getPage(pageUrl) {
  let options = {
    method: 'GET',
    uri: pageUrl,
  };
  res = await rp(options);
  // console.log(url);
  return res;
}

// 生成当前页的下载链接
// 解析html 生成 [标题] [下载链接] [图片数量] 数组
// 通过数组生成 三层下载链接二维数组, 把数组返回
async function getLi(pageUrl) {
  const a_down_links = await getPage(pageUrl).then(res => {

    let titles = []; // 标题
    let links = []; // 目录链接 
    let nums = []; // 数量
    let down_links = []; //整合三层下载链接
    let index = 0; // 页起始位置

    // 解析html
    $ = cheerio.load(res);
    // 获取 li
    const reg = /\D/g; // 除了数字
    const reg_t = /[\\|\/|\:|\*|\?|\<|\>|"|\r|\n|\s*|\b|\f|\t|\v|\"|\`]/g; // 去掉特殊符号
    const reg2 = /^(\s+)|(\s+)$/g; // 去掉前后空格
    // titles
    $('div[class=hezi] ul li .biaoti').each(function (z, elem) {
      titles.length = z;
      // 去掉斜杠,换成空格
      titles[z] = $(this).text().replace(reg_t, ' ').replace(reg2, '');
    });
    // links
    $('div[class=hezi] ul li a img').each(function (z, elem) {
      links.length = z;
      links[z] = $(this).attr('src').split('0.')[0];
      // 分割地址
    });
    // nums
    $('div[class=hezi] ul li .shuliang').each(function (z, elem) {
      nums.length = z;
      nums[z] = parseInt($(this).text().replace(reg, ''));
      // 类型转换 正则替换字母
    });
    // console.log(titles[0], titles.length);
    // console.log(links[0], links.length);
    // console.log(nums);


    // 通过数组生成 三层下载链接二维数组, 把数组发给下载函数
    // console.log(a);
    let al = titles.length - index; // 起始位置偏移
    let tempi = index; // 暂存i,修改起始位置后down_links数组偏移量
    down_links = Array(al); // 1层 链接数组长度

    // 生成下载链接 
    // console.log("套图数量: " + titles.length);

    // [[title,[1,2,3]],[title,[1,2,3]]
    // 三层数组结构
    for (index; index < titles.length; index++) {
      let src = Array(nums[index]); // 3层 链接数组
      let title = Array(index); // 2层 标题
      for (let n = 0; n < nums[index] + 1; n++) {
        src[n] = links[index] + n + '.jpg';
        // console.log(src, nums[i], n);
      }
      title[0] = titles[index];
      title[1] = src;
      // console.log("0:" + title[0]);
      down_links[index - tempi] = title;
      // console.log("down_links: ", down_links[al - 1]);
    }
    return down_links;
  });
  return a_down_links;
};


// 解析三层数组,创建文件夹队列,图片下载队列
// [[title,[1,2,3]],[title,[1,2,3],[title,[1,2,3]]
async function downloads(pageUrl, pageTiltle) {
  const down_links = await getLi(pageUrl);
  console.log("页面:", pageUrl, "套数:", down_links.length);

  // 必须先创建文件夹, 再创建文件夹队列

  let input2 = Array(down_links.length)

  for (let k = 0; k < down_links.length; k++) {
    const fileURLs = down_links[k];
    // console.log(fileURLs[0]);
    // 生成文件夹名 
    const downloadPath = depositPath + pageTiltle + "/" + fileURLs[0];

    // 传入: 名称 位置 页地址 总长度 文件保存地址
    input2[k] = [limit(() => newFile(downloadPath, fileURLs[0], k, pageUrl, down_links.length))];
    // console.log("input2:", k, input2[k]);

    // 创建文件下载队列
    let input = Array(fileURLs[1].length);
    let j = 0;
    async.mapSeries(fileURLs[1], function (fileURL, callback) {
      // 输入队列
      input[j] = [limit(() => restart(fileURL, downloadPath))];
      j++;
      // console.log("input:", j, input[j]);
      callback(null);

    }, function (err) {
      // console.log("eachLimit:" + l + err);
    });
    j = 0;
    // 执行下载队列
    (async () => {
      // Only one promise is run at once
      const result = await Promise.all(input);
      // console.log(result);
    })();
  }
  // 执行创建文件夹队列
  (async () => {
    // Only one promise is run at once
    const result = await Promise.all(input2);
    // console.log(result);
  })();
  // return 1;
}


// 网络错误拦截 自动重试
async function restart(fileURL, downloadPath) {
  // 临时保存路径, 防止重试时路径更新
  // const downloadPathBack = downloadPath;
  // 第一次请求
  let a_res = await download_url(fileURL, downloadPath);
  // console.log("a_res: ", a_res);

  // 若果请求失败则重试
  if (a_res === 'AbortError' || a_res === 'FetchError') {
    let j = 0
    while (j < reNum) {
      j++;
      const time = sd.format(new Date(), 'YYYY-MM-DD HH:mm:ss');
      console.log(time, a_res + ":连接超时," + ms / 1000 + "秒后开始第" + j + "次重连:" + fileURL);

      await sleep(ms);
      // 使用临时路径
      a_res = await download_url(fileURL, downloadPath)
      // console.log("a_res2: ", a_res);

      if (a_res != 'AbortError' && a_res != 'FetchError') {
        // console.log("OK");
        return "OK_re";
      }
    }
    if (a_res === 'AbortError' || a_res === 'FetchError') {
      console.log("网络异常, 断开连接");
      limit.clearQueue(); // 网络错误, 清空队列退出
      return "超时";
    }
  } else {
    // console.log("a_res3: ", a_res);
    return a_res;
  }
}


// 开始
async function start() {
  // 解析页地址,生成套图链接队列
  let input3 = Array(address.length);
  // 自动翻页, 自动删除已下载页面?

  // 解析地址标题 和 详细地址
  for (let l = 0; l < address.length; l++) {
    const pageTiltle = address[l][0]; // 分类标题
    const pageUrl = address[l][1]; // 地址集合
    await newFile(depositPath + pageTiltle); // 先创建总文件夹

    for (let i = 0; i < pageUrl.length; i++) {
      input3[l] = [limit(() => downloads(pageUrl[i], pageTiltle))];
    }
  }
  (async () => {
    // Only one promise is run at once
    const result = await Promise.all(input3);
    // console.log(result);
  })();
  console.log("end");
}

// 开始!
start()

const sleep = ms => new Promise(
  resolve => setTimeout(resolve, ms)
);
// await sleep(1000);



// 连接超时
// 自动重连×
// 断点续传 重复跳过
// 一键输入爬取地址和储存地址× 
// 另写一个函数爬取和写地址文件

// 图片总张数 总套数
// 当前下载套图序号 [1[2[3]]] 第一页 第二套 第三张