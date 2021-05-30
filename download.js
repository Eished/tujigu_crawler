const rp = require("request-promise"),
  cheerio = require("cheerio"), //进入cheerio模块
  fs = require("fs"), //进入fs模块
  {
    m_time
  } = require("./config"); //存放照片的地址
const fetch = require('node-fetch');
const path = require("path");
const progressStream = require('progress-stream');
const AbortController = require('abort-controller');
const sd = require('silly-datetime');
const {
  reject
} = require("async");


// downloadPath 异步问题: 2分钟后重试时, 目录已经变化
// 解决方法, 提前生成 downloadPath 保存到局部变量, 再传输过来使用
// let downloadPath = '';

module.exports = {
  // 小文件可以使用, 同步执行, 支持自动重连
  async download_url(fileURL, downloadPath) {

    //下载保存的文件路径
    let fileSavePath = path.join(downloadPath, path.basename(fileURL));
    // 判断文件是否已经存在
    if (fs.existsSync(fileSavePath)) {
      const time = sd.format(new Date(), 'YYYY-MM-DD HH:mm:ss');
      console.log(time, "文件已存在:", fileSavePath);
      return "已存在";
    };

    // 手动超时控制
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, m_time);

    try {
      const resp = await fetch(fileURL, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/octet-stream'
          },
          signal: controller.signal,
        })
        .then(res => {
          const time = sd.format(new Date(), 'YYYY-MM-DD HH:mm:ss');
          console.log(time, "开始下载:", fileURL);
          return res.buffer();
        })
        .then(_ => {
          // 异步问题
          // 用同步方法
          fs.writeFileSync(fileSavePath, _, "binary");
        })
        .then(() => {
          // 打印下载成功信息
          const time = sd.format(new Date(), 'YYYY-MM-DD HH:mm:ss');
          console.log(time, "下载完成:", fileSavePath);
          return "OK";
        })
        .catch(e => {
          // console.log(e.name);
          return e.name;
        })
      // console.log("response:", resp);
      return resp;
    } finally {
      // console.log("finally");
      clearTimeout(timeout);
    }
  },

  // 大文件 + 单线程 + 手动超时, 支持自动重连
  async download_url2(fileURL, downloadPath) {

    //下载保存的文件路径
    let fileSavePath = path.join(downloadPath, path.basename(fileURL));

    // 判断文件是否已经存在
    if (fs.existsSync(fileSavePath)) {
      const time = sd.format(new Date(), 'YYYY-MM-DD HH:mm:ss');
      console.log(time, "文件已存在:", fileSavePath);
      return "已存在";
    };

    let m_time = 120000; //超时时间
    // 手动超时控制器
    const controller = new AbortController();

    //缓存文件路径
    let tmpFileSavePath = fileSavePath + ".tmp";
    //下载进度信息保存文件
    let cfgFileSavePath = fileSavePath + ".cfg.json";

    let downCfg = {
      rh: {}, //请求头
      percentage: 0, //进度
      transferred: 0, //已完成
      length: 0, //文件大小
      remaining: 0, //剩余
      first: true //首次下载
    };
    let tmpFileStat = {
      size: 0
    };
    //判断文件缓存 与 进度信息文件是否存在 
    if (fs.existsSync(tmpFileSavePath) && fs.existsSync(cfgFileSavePath)) {
      tmpFileStat = fs.statSync(tmpFileSavePath);
      downCfg = JSON.parse(fs.readFileSync(cfgFileSavePath, 'utf-8').trim());
      downCfg.first = false;
      //设置文件
      downCfg.transferred = tmpFileStat.size;
    }

    //创建写入流
    let writeStream = null;

    //请求头
    let fetchHeaders = {
      'Content-Type': 'application/octet-stream',
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      Pragma: "no-cache",
    };
    //追加请求范围
    if (downCfg.length != 0) {
      fetchHeaders.Range = "bytes=" + downCfg.transferred + "-" + downCfg.length; //71777113
    }
    if (downCfg.rh["last-modified"]) {
      fetchHeaders["last-modified"] = downCfg.rh["last-modified"];
    }
    //校验文件头
    const checkHerder = [
      "last-modified", //文件最后修改时间
      "server", //服务器
      // "content-length",//文件大小
      "content-type", //返回类型
      "etag", //文件标识
    ];

    try {
      const resp = await fetch(fileURL, {
          method: 'GET',
          headers: fetchHeaders,
          // timeout: 3000,
          signal: controller.signal,
        })
        .then(res => {
          const promise = new Promise(function (resolve, reject) {
            let h = {};
            res.headers.forEach(function (v, i, a) {
              h[i.toLowerCase()] = v;
            });
            // console.log(h);
            //文件是否发生变化
            let fileIsChange = false;
            //是否首次下载
            if (downCfg.first) {
              //记录相关信息
              for (let k of checkHerder) downCfg.rh[k] = h[k];
              downCfg.length = h["content-length"];
            } else {
              //比较响应变化
              for (let k of checkHerder) {
                if (downCfg.rh[k] != h[k]) {
                  fileIsChange = true;
                  break;
                }
              }
              //是否运行范围下载
              downCfg.range = res.headers.get("content-range") ? true : false;
            }
            //创建文件写入流
            writeStream = fs.createWriteStream(tmpFileSavePath, {
                'flags': !downCfg.range || fileIsChange ? 'w' : 'a'
              })
              .on('error', e => reject(e.name)).on('ready', function () {
                const time = sd.format(new Date(), 'YYYY-MM-DD HH:mm:ss');
                console.log(time, "开始下载:", fileURL);
                // 手动超时重试
                const timeout = setTimeout(() => {
                  // 中断请求
                  controller.abort();

                  clearTimeout(timeout);
                  // 返回错误
                  reject("AbortError");
                  // 不能终止promise, 会进度丢失, 无法打开文件
                  // return 0;
                }, m_time);

              }).on('finish', function () {
                //下载完成后重命名文件
                fs.renameSync(tmpFileSavePath, fileSavePath);
                fs.unlinkSync(cfgFileSavePath);
                const time = sd.format(new Date(), 'YYYY-MM-DD HH:mm:ss');
                console.log(time, '文件下载完成:', fileSavePath);
                resolve(1);
              });

            //写入信息文件
            fs.writeFileSync(cfgFileSavePath, JSON.stringify(downCfg));
            //获取请求头中的文件大小数据
            let fsize = h["content-length"];
            //创建进度
            let str = progressStream({
              length: fsize,
              time: 500 /* ms */
            });

            //创建进度对象
            str.on('progress', function (progressData) {
              //不换行输出
              let percentage = Math.round(progressData.percentage) + '%';
              console.log(percentage);
              //     console.log(`
              //     进度 ${progressData.percentage}
              //     已完成 ${progressData.transferred}
              //     文件大小 ${progressData.length}
              //     剩余 ${progressData.remaining}
              //         ${progressData.eta}
              //     运行时 ${progressData.runtime}
              //         ${ progressData.delta}
              //    速度 ${ progressData.speed}
              //             `);
              // console.log(progress);
              /*
              {
                  percentage: 9.05,
                  transferred: 949624,
                  length: 10485760,
                  remaining: 9536136,
                  eta: 42,
                  runtime: 3,
                  delta: 295396,
                  speed: 949624
              }
              */
            });

            res.body.pipe(str).pipe(writeStream);
            // res.headers.forEach(function (v, i, a) {
            //   console.log(i + " : " + v);
            // });

          }).catch(e => {
            // 返回超时错误
            // console.log(e);
            return e;
          });;
          // console.log("resultStr: ");
          return promise;
        }).catch(e => {
          // console.log("222error: ", e.name);
          return e.name;
        })
      // console.log("response:", resp);
      return resp;
    } finally {
      // console.log("finally");
      // clearTimeout(timeout);
    }
  },

  // 创建文件夹,和提示一堆东西
  newFile(downloadPath, title, index, pageUrl, downloadLinksLength) {
    const promise = new Promise((resolve, reject) => {
      const time = sd.format(new Date(), 'YYYY-MM-DD HH:mm:ss');
      if (fs.existsSync(downloadPath)) {
        if (title) {
          console.log(time, "文件夹已存在:" + title, "页面:" + pageUrl, index + 1, "/", downloadLinksLength);
        } else {
          console.log(time, "文件夹已存在:" + downloadPath);
        }
        resolve(2);
      };
      fs.mkdirSync(downloadPath);
      if (title) {
        console.log(time, "文件夹创建成功:" + title, "页面:" + pageUrl, index + 1, "/", downloadLinksLength);
      } else {
        console.log(time, "文件夹创建成功:" + downloadPath);
      }
      resolve(1);
    }).catch(e => {
      //自定义异常处理
      console.log("创建文件夹失败!", e);
      reject(e);
    });
    return promise;
  }
}