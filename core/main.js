if (!owo) {
  console.error('没有找到owo核心!')
}

// 注册owo默认变量
// 框架状态变量
owo.state = {}
// 框架全局变量
owo.global = {}
// 全局方法变量
owo.tool = {}

// 便捷的获取工具方法
var $tool = owo.tool
var $data = {}

// 框架核心函数
var _owo = {}

// 对象合并方法
_owo.assign = function(a, b) {
  var newObj = {}
  for (var key in a){
    newObj[key] = a[key]
  }
  for (var key in b){
    newObj[key] = b[key]
  }
  return newObj
}

// 针对低版本IE浏览器做兼容处理
if (!document.getElementsByClassName) {
  document.getElementsByClassName = function (className, element) {
    var children = (element || document).getElementsByTagName('*');
    var elements = new Array();
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var classNames = child.className.split(' ');
      for (var j = 0; j < classNames.length; j++) {
        if (classNames[j] == className) {
          elements.push(child);
          break;
        }
      }
    }
    return elements;
  };
}

// 运行页面所属的方法
_owo.handlePage = function (pageName, entryDom) {
  _owo.handleEvent(entryDom, null , entryDom)
  // 判断页面是否有自己的方法
  var newPageFunction = window.owo.script[pageName]
  if (!newPageFunction) return
  // console.log(newPageFunction)
  // 如果有created方法则执行
  if (newPageFunction.created) {
    // 注入运行环境
    newPageFunction.created.apply(_owo.assign(newPageFunction, {
      $el: entryDom,
      data: newPageFunction.data,
      activePage: window.owo.activePage
    }))
  }
  
  // 判断页面是否有下属模板,如果有运行所有模板的初始化方法
  for (var key in newPageFunction.template) {
    var templateScript = newPageFunction.template[key]
    if (templateScript.created) {
      // 获取到当前配置页的DOM
      // 待修复,临时获取方式,这种方式获取到的dom不准确
      var domList = document.querySelectorAll('[template="' + key +'"]')
      // 有时候在更改html时会将某些块进行删除
      if (domList.length == 0) {
        console.info('无法找到页面组件:' + key)
      }
      // console.log(domList.length)
      for (var ind = 0; ind < domList.length; ind++) {
        // 为模板注入运行环境
        templateScript.created.apply(_owo.assign(newPageFunction.template[key], {
          $el: domList[ind],
          data: templateScript.data,
          activePage: window.owo.activePage
        }))
      }
    }
  }
}

// owo-name处理
_owo.handleEvent = function (tempDom, templateName, entryDom) {
  // console.log(templateName)
  var activePage = window.owo.script[owo.activePage]
  
  if (tempDom.attributes) {
    for (let ind = 0; ind < tempDom.attributes.length; ind++) {
      var attribute = tempDom.attributes[ind]
      // 判断是否为owo的事件
      // ie不支持startsWith
      if (attribute.name[0] == '@') {
        var eventName = attribute.name.slice(1)
        var eventFor = attribute.textContent
        switch (eventName) {
          case 'show' : {
            // 初步先简单处理吧
            var temp = eventFor.replace(/ /g, '')
            // 取出条件
            const condition = temp.split("==")
            if (activePage.data[condition[0]] != condition[1]) {
              tempDom.style.display = 'none'
            }
            break
          }
          default: {
            tempDom["on" + eventName] = function(event) {
              // 因为后面会对eventFor进行修改所以使用拷贝的
              var eventForCopy = eventFor
              // 判断页面是否有自己的方法
              var newPageFunction = window.owo.script[window.owo.activePage]
              // console.log(this.attributes)
              if (templateName) {
                // 如果模板注册到newPageFunction中，那么证明模板没有script那么直接使用eval执行
                if (newPageFunction.template) {
                  newPageFunction = newPageFunction.template[templateName]
                } else {
                  eval(eventForCopy)
                  return
                }
              }
              // 待优化可以单独提出来
              // 取出参数
              var parameterArr = []
              var parameterList = eventForCopy.match(/[^\(\)]+(?=\))/g)
              
              if (parameterList && parameterList.length > 0) {
                // 参数列表
                parameterArr = parameterList[0].split(',')
                // 进一步处理参数
                
                for (var i = 0; i < parameterArr.length; i++) {
                  var parameterValue = parameterArr[i].replace(/(^\s*)|(\s*$)/g, "")
                  // console.log(parameterValue)
                  // 判断参数是否为一个字符串
                  
                  if (parameterValue.charAt(0) === '"' && parameterValue.charAt(parameterValue.length - 1) === '"') {
                    parameterArr[i] = parameterValue.substring(1, parameterValue.length - 1)
                  }
                  if (parameterValue.charAt(0) === "'" && parameterValue.charAt(parameterValue.length - 1) === "'") {
                    parameterArr[i] = parameterValue.substring(1, parameterValue.length - 1)
                  }
                  // console.log(parameterArr[i])
                }
                eventForCopy = eventForCopy.replace('(' + parameterList + ')', '')
              } else {
                // 解决 @click="xxx()"会造成的问题
                eventForCopy = eventForCopy.replace('()', '')
              }
              // console.log(newPageFunction)
              // 如果有方法,则运行它
              if (newPageFunction[eventForCopy]) {
                // 绑定window.owo对象
                // console.log(tempDom)
                // 待测试不知道这样合并会不会对其它地方造成影响
                newPageFunction.$el = entryDom
                newPageFunction.$event = event
                newPageFunction[eventForCopy].apply(newPageFunction, parameterArr)
              } else {
                // 如果没有此方法则交给浏览器引擎尝试运行
                eval(eventForCopy)
              }
            }
          }
        }
      }
    }
  }
  
  if (tempDom.children) {
    // 递归处理所有子Dom结点
    for (var i = 0; i < tempDom.children.length; i++) {
      var childrenDom = tempDom.children[i]
      // console.log(childrenDom)
      let newTemplateName = templateName
      if (tempDom.attributes['template'] && tempDom.attributes['template'].textContent) {
        newTemplateName = tempDom.attributes['template'].textContent
      }
      // 待修复，多页面情况下可能判断不了是否是页面
      if (newTemplateName === owo.entry) {
        _owo.handleEvent(childrenDom, null, tempDom)
      } else {
        _owo.handleEvent(childrenDom, newTemplateName, tempDom)
      }
    }
  } else {
    console.info('元素不存在子节点!')
    console.info(tempDom)
  }
  
}


// 跳转到指定页面
function $go (pageName, inAnimation, outAnimation, param) {
  owo.state.animation = {
    "in": inAnimation,
    "out": outAnimation
  }
  var paramString = ''
  if (param && typeof param == 'object') {
    paramString += '?'
    // 生成URL参数
    for (let paramKey in param) {
      paramString += paramKey + '=' + param[paramKey] + '&'
    }
    // 去掉尾端的&
    paramString = paramString.slice(0, -1)
  }
  window.location.href = paramString + "#" + pageName
}

function $change (key, value) {
  // 更改对应的data
  owo.script[owo.activePage].data[key] = value
  // 当前页面下@show元素列表
  var showList = document.getElementById('o-' + owo.activePage).querySelectorAll('[\\@show]')
  showList.forEach(element => {
    // console.log(element)
    var order = element.attributes['@show'].textContent
    // console.log(order)
    // 去掉空格
    order = order.replace(/ /g, '')
    if (order == key + '==' + value) {
      element.style.display = ''
    } else {
      element.style.display = 'none'
    }
  })
}
