#!/usr/bin/env node

'use strict'
const fs = require('fs')
const path = require('path')
// 文件变动检测
const chokidar = require('chokidar')

const Script = require('./lib/script')
// 日志输出
const { getLogger } = require('log4js')
const logger = getLogger()

// js预处理
const postcss      = require('postcss')
const precss = require('precss')
// css压缩
const cssnano = require('cssnano')
const autoprefixer = require('autoprefixer')

const bodyHandle = require('./lib/page')
const Cut = require('./lib/cut')
// 删除目录所有内容
const DELDIR = require('./lib/delDir')

// Web 框架
const express = require('express')
const app = express()
// 使express处理ws请求
const wsServe = require('express-ws')(app)


// 打包的版本号
let version = ''

// 配置日志输出等级
// logger.level = 'debug'
logger.level = 'info'

// 命令行运行目录
const runPath = process.cwd()
let startTime = null

// 当前打包的模板
let htmlTemple = ''

// 判断运行目录下是否包含配置文件
if (!fs.readFileSync(path.join(runPath, 'ozzx.js'))) {
  logger.error('ozzx.js file does not exist!')
  close()
}

// 读取配置文件
let config = eval(fs.readFileSync(path.join(runPath, 'ozzx.js'), 'utf8'))

// 判断使用哪套配置文件
const processArgv = process.argv[2]
if (processArgv) {
  if (config[processArgv]) {
    // 深拷贝
    const processConfig = JSON.parse(JSON.stringify(config[processArgv]))
    config = Object.assign(processConfig, config)
  } else {
    logger.error(`config name ${processArgv} not found in ozzx.js!`)
    return
  }
}

// 输出目录
const outPutPath = path.join(runPath, config.outFolder)
const corePath = path.join(__dirname, 'core')

// 静态资源目录
const staticPath = path.join(outPutPath, 'static')

// 读取指定目录文件
function loadFile(path) {
  if (fs.existsSync(path)) {
    return fs.readFileSync(path, 'utf8')
  } else {
    logger.error(`file does not exist: ${path}`)
    return ''
  }
}

// 处理style
function handleStyle(dom, changePath) {
  let styleData = ''
  // 版本号后缀
  const versionString = config.outPut.addVersion ? `.${version}` : ''
  let outPutCss = dom.style
  // 读取出全局样式
  if (config.outPut.globalStyle) {
    const mainStylePath = path.join(runPath, config.outPut.globalStyle)
    if (fs.existsSync(mainStylePath)) {
      const mainStyle = fs.readFileSync(path.join(runPath, config.outPut.globalStyle), 'utf8') + '\r\n'
      // 混合css
      outPutCss = mainStyle + outPutCss
    } else {
      logger.error(`globalStyle file not find!`)
    }
  }
  
  // --------------------------------- 动画效果 ---------------------------------------------
  // 判断是自动判断使用的动画效果还是用户指定
  if (config.outPut.choiceAnimation) {
    logger.debug('用户设置加载全部动画效果!')
    // 加载全部特效
    const animationFilePath = path.join(corePath, 'animation', `animations.css`)
    outPutCss += loadFile(animationFilePath)
  } else {
    const useAnimationList = config.outPut.useAnimationList || dom.useAnimationList
    useAnimationList.forEach(animationName => {
      const animationFilePath = path.join(corePath, 'animation', `${animationName}.css`)
      outPutCss += loadFile(animationFilePath)
    })
  }

  // ----------------------------------------------- 使用postcss处理 -----------------------------------------------
  // 自动加浏览器前缀
  // console.log(autoprefixer.process)
  let plugList = [precss, autoprefixer]
  // 判断是否压缩优化css
  if (config.minifyCss) {
    plugList.push(cssnano)
  }
  postcss(plugList).process(outPutCss, { from: undefined, cascade: true }).then( (result) => {
    const styleDir = path.join(staticPath, 'css')
    result.warnings().forEach((warn) => {
      console.warn(warn.toString());
    })
    // console.log('css处理完毕!')
    dom.style = result.css
    // ----------------------------------------------- 输出css -----------------------------------------------
    if (!changePath) {
      DELDIR(styleDir)
      logger.debug(`delete css dir success!`)
      // 重新创建目录
      fs.mkdirSync(styleDir)
    }
    
    styleData += `<!-- 页面主样式文件 -->\r\n    <link rel="stylesheet" href="./static/css/main${versionString}.css">`
    
    // 判断是否输出时间
    if (config.outPut.addTime) {
      dom.style = `/* ${new Date().toString()} */\r\n` + dom.style
    }
    fs.writeFileSync(path.join(staticPath, 'css', `main${versionString}.css`), dom.style)


    let completeNum = 0
    
    // 如果没有额外的css直接输出
    if (!config.styleList || config.styleList.length === 0) {
      htmlTemple = htmlTemple.replace(`<!-- css-output -->`, styleData)
      outPutHtml()
      return
    } else {
      styleData += `\r\n    <!-- 附属css文件 -->`
    }
    for (let ind = 0; ind < config.styleList.length; ind++) {
      const element = config.styleList[ind]
      // 判断是设置了路径
      if (!element.src) {
        console.error('style path unset!', element)
        continue
      }
      // -------------sdsd---------------------------------------------------------
      // 如果是网络地址那么不需要进行处理
      if (element.src.startsWith('http')) {
        styleData += `\r\n    <link rel="stylesheet" href="${element.src}">`
        if (++completeNum >= config.styleList.length) {
          htmlTemple = htmlTemple.replace(`<!-- css-output -->`, styleData)
          outPutHtml()
        }
        
        continue
      } else {
        styleData += `\r\n    <link rel="stylesheet" href="./static/css/${element.name}.css">`
      }
      // 输出路径
      const outPutFile = path.join(staticPath, 'css', `${element.name}.css`)
      if (changePath === undefined || changePath === path.join(runPath, element.src)) {
        moveFile(path.join(runPath, element.src), outPutFile)
      }
      if (++completeNum >= config.styleList.length) {
        htmlTemple = htmlTemple.replace(`<!-- css-output -->`, styleData)
        outPutHtml()
      }
    }
  })
}

// 处理heard
function handleHrard(headList) {
  // 取出所有Heard标识
  let heardData = '<!-- 页面的元信息 -->'
  headList.forEach(element => {
    let heard = `\r\n    <meta`
    for (const key in element) {
      const value = element[key]
      heard += ` ${key}="${value}"`
    }
    heard += `/>`
    heardData += `${heard}`
  })
  htmlTemple = htmlTemple.replace(`<!-- *head* -->`, heardData)
  outPutHtml()
}

// 复制文件到指定路径
function moveFile (fromPath, toPath) {
  fs.readFile(fromPath, (err, fileData) => {
    if (err) throw err
    fs.writeFile(toPath, fileData, () => {
      logger.info(`copy file: ${toPath}`)
    })
  })
}

// 输出script
function outPutScript (scriptData) {
  // 版本号后缀
  const versionString = config.outPut.addVersion ? `.${version}` : ''
  // 如果有全局js则加入全局js
  if (config.outPut.globalScript) {
    const globalScriptData = fs.readFileSync(config.outPut.globalScript)
    if (globalScriptData) {
      logger.info(`add global script: ${config.outPut.globalScript}`)
      scriptData += '\r\n<script>' + globalScriptData + '\r\n</script>'
    } else {
      logger.error('global script is set but file not found!')
    }
  }
  scriptData += `\r\n    <!-- 主要script文件 -->\r\n    <script src="./static/js/main${versionString}.js" type="text/javascript"></script>`
  htmlTemple = htmlTemple.replace(`<!-- script-output -->`, scriptData)
  outPutHtml()
}


// 处理script
function handleScript (dom, changePath) {
  // 版本号后缀
  const versionString = config.outPut.addVersion ? `.${version}` : ''
  // 根据不同情况使用不同的core
  // 读取出核心代码
  let coreScript = loadFile(path.join(corePath, 'main.js'))
  if (config.pageList.length === 1) {
    // 单页面
    coreScript += loadFile(path.join(corePath, 'SinglePage.js'))
  } else {
    // 多页面
    logger.info('multi page!')
    coreScript += loadFile(path.join(corePath, 'MultiPage.js'))
  }
  // 页面切换特效
  // 判断是否存在页面切换特效
  const useAnimationList = config.outPut.useAnimationList || dom.useAnimationList
  if (useAnimationList.length > 0 || config.outPut.choiceAnimation) {
    logger.info('animation!')
    coreScript += loadFile(path.join(corePath, 'animation.js'))
  }
  // 整合页面代码
  coreScript += dom.script
  // 处理使用到的方法
  let toolList = Cut.stringArray(coreScript, 'ozzx.tool.', '(')
  let toolList2 = Cut.stringArray(coreScript, '$tool.', '(')
  // 数组去重
  toolList = new Set(toolList.concat(toolList2))
  toolList.forEach(element => {
    // console.log(element)
    coreScript += loadFile(path.join(corePath, 'tool', `${element}.js`))
  })
  // 使用bable处理代码
  dom.script = Script(coreScript, config.outPut.minifyJs).code

  // ----------------------------------------------- 输出js -----------------------------------------------
  const scriptDir = path.join(staticPath, 'js')
  let scriptData = '<!-- 页面脚本 -->'
  if (!changePath) {
    // 删除目录
    DELDIR(scriptDir)
    logger.debug(`delete script dir success!`)
    // 重新创建目录
    fs.mkdirSync(scriptDir)
  }
  
  // 判断是否输出时间
  if (config.outPut.addTime) {
    dom.script = `// ${new Date().toString()}\r\n` + dom.script
  }
  // 写出主要硬盘文件
  fs.writeFileSync(path.join(staticPath, 'js' , `main${versionString}.js`), dom.script)
  
  // 判断是否需要加入自动刷新代码
  if (config.autoReload) {
    if (!changePath) {
      moveFile(path.join(corePath, 'debug', 'autoReload.js'), path.join(staticPath, 'js', `autoReload.js`))
    }
    scriptData += '\r\n    <script src="./static/js/autoReload.js" type="text/javascript"></script>'
  }

  // 处理引用的script
  if (config.scriptList && config.scriptList.length > 0) {
    // 遍历引用列表
    let completeNum = 0
    for (let ind = 0; ind < config.scriptList.length; ind++) {
      const element = config.scriptList[ind]
      // console.log(element)
      
      // 判断是设置了路径
      if (!element.src) {
        console.error('script path unset!', element)
        continue
      }
      // 如果是网络地址那么不需要进行处理
      if (element.src.startsWith('http')) {
        scriptData += `\r\n    <script src="${element.src}" type="text/javascript" ${element.defer ? 'defer="defer"' : ''}></script>`
        // 判断是否为最后项,如果为最后一项则输出script
        if (++completeNum >= config.scriptList.length) {
          outPutScript(scriptData)
        }
        continue
      } else {
        scriptData += `\r\n    <script src="./static/js/${element.name}.js" type="text/javascript" ${element.defer ? 'defer="defer"' : ''}></script>`
      }
      // 输出路径
      const outPutFile = path.join(staticPath, 'js', `${element.name}.js`)
      // 判断是否用babel处理
      if (element.babel) {
        if (changePath === undefined || changePath === path.join(runPath, element.src)) {
          fs.readFile(path.join(runPath, element.src), (err, fileData) => {
            if (err) throw err
            fs.writeFile(outPutFile, Script(fileData, config.outPut.minifyJs).code, () => {
              logger.info(`bable and out put file: ${outPutFile}`)
              // 判断是否为最后项,如果为最后一项则输出script
              if (++completeNum >= config.scriptList.length) {
                // 如果有全局js则加入全局js
                if (config.outPut.globalScript) {
                  
                  const globalScriptData = fs.readFileSync(config.outPut.globalScript)
                  if (globalScriptData) {
                    logger.info(`add global script: ${config.outPut.globalScript}`)
                    scriptData += '\r\n    <script>\r\n' + globalScriptData + '\r\n    </script>'
                  } else {
                    logger.error('global script is set but file not found!')
                  }
                }
                scriptData += `\r\n    <!-- 主要script文件 -->\r\n    <script src="./static/js/main${versionString}.js" type="text/javascript"></script>`
                htmlTemple = htmlTemple.replace(`<!-- script-output -->`, scriptData)
                outPutHtml()
              }
            })
          })
        } else {
          if (++completeNum >= config.scriptList.length) {
            outPutScript(scriptData)
          }
        }
      } else {
        // 如果不使用babel处理则进行复制文件
        if (changePath === undefined || changePath === path.join(runPath, element.src)) {
          moveFile(path.join(runPath, element.src), outPutFile)
        }
        if (++completeNum >= config.scriptList.length) {
          outPutScript(scriptData)
        }
      }
    }
  } else {
    // 如果没有引用script，则直接输出html
    htmlTemple = htmlTemple.replace(`<!-- script-output -->`, scriptData)
    outPutHtml()
  }
}


function outPutHtml () {
  // logger.info(htmlTemple)
  if (!htmlTemple.includes('output')) {
    // 判断是否输出时间
    if (config.outPut.addTime) {
      htmlTemple = htmlTemple + `\r\n<!-- ${new Date().toString()} -->`
    }
    fs.writeFileSync(path.join(outPutPath, 'index.html'), htmlTemple)
    logger.info(`Package success! use time ${new Date().getTime() - startTime}`)

    if (config.autoReload) {
      // 广播发送重新打包消息
      wsServe.getWss().clients.forEach(client => client.send('reload'))
    }
  }
}
// 执行默认打包任务
function pack (changePath) {
  // 记录开始打包时间
  startTime = new Date().getTime()

  // 判断输出目录是否存在,如果不存在则创建目录
  if (!fs.existsSync(staticPath)) {
    fs.mkdirSync(staticPath)
  }
  // 判断是否为更新
  if (!changePath) {
    // 生成版本号
    version = Math.random().toString(36).substr(2)
    // 清空静态文件目录
    if (!fs.existsSync(staticPath)) {
      DELDIR(staticPath)
    }
  }

  
  
  // 读取入口模板文件(一次性读取到内存中)
  htmlTemple = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
  // 处理title
  htmlTemple = htmlTemple.replace('{{title}}', config.title || 'ozzx')
  handleHrard(config.headList)
  const dom = bodyHandle(htmlTemple, config)
  htmlTemple = dom.html
  // 处理style
  handleStyle(dom, changePath)
  // 处理script
  handleScript(dom, changePath)
}

// 开始打包
pack()

// 判断是否开启文件变动自动重新打包
if (config.watcher && config.watcher.enable) {
  let watcherFolder = config.watcher.folder
  if (!watcherFolder) {
    watcherFolder = './src'
    logger.error('watcher is enable, but watcher.folder not set! use default value: "./src"')
  } else {
    watcherFolder = path.join(runPath, watcherFolder)
    logger.info(`watcher folder: ${watcherFolder}`)
  }
  // 文件变动检测
  const watcher = chokidar.watch(watcherFolder, {
    // 忽略目录
    ignored: config.watcher.ignored ? config.watcher.ignored : config.outFolder + '/*',
    persistent: true,
    usePolling: true,
    // 检测深度
    depth: config.watcher.depth
  })

  watcher.on('change', changePath => {
    logger.info(`file change: ${changePath}`)
    // 重新打包
    pack(changePath)
  })
}

// 判断是否启用静态文件服务
if (config.server) {
  app.use(express.static(path.join(runPath, config.outFolder)))
}


// 处理websocket消息
if (config.autoReload) {
  app.ws('/', function(ws, req) {
    ws.on('message', function(msg) {
      console.log(ws);
    })
  })
}


if (config.server || config.autoReload) {
  const port = config.serverPort || 8000
  app.listen(port)
  logger.info(`server is running at 127.0.0.1:${port}`)
}
