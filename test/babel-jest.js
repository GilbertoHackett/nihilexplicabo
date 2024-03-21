"use strict"

let babel
const crypto = require("crypto")
const fs = require("fs")
const jestPreset = require("babel-preset-jest")
const path = require("path")

const convert = require("convert-source-map")

let babelRc;

function getBabelRcDigest() {
  if (babelRc == null) {
    let configFile
    try {
      configFile = fs.readFileSync(path.join(__dirname, ".babelrc"))
    }
    catch (e) {
      configFile = fs.readFileSync(path.join(__dirname, "..", ".babelrc"))
    }

    babelRc = crypto
      .createHash("md5")
      .update(configFile)
      .digest("base64")
  }
  return babelRc;
}

// compiled by ts-babel - do not transform
function isFullyCompiled(fileData) {
  return fileData.startsWith(`"use strict";`) && fileData.includes("var _")
}

function createTransformer(options) {
  options = Object.assign({}, options, {
    presets: (options && options.presets || []).concat([jestPreset]),
  })

  delete options.cacheDirectory

  return {
    canInstrument: true,
    getCacheKey(fileData, filename, configString, _ref2) {
      return crypto.createHash("md5")
        .update(fileData)
        .update(isFullyCompiled(fileData) ? "f": "p")
        .update(configString)
        .update(getBabelRcDigest())
        .update(_ref2.instrument ? "instrument" : "")
        .digest("hex")
    },
    process(src, filename, config, transformOptions) {
      // allow  ~/Documents/electron-builder/node_modules/electron-builder/out/targets/nsis.js:1

      const nodeModulesIndexOf = filename.indexOf("node_modules")
      if ((nodeModulesIndexOf > 0 && !filename.includes("electron-builder", nodeModulesIndexOf)) || !(filename.includes("/out/") || filename.includes("\\out\\"))) {
        // console.log(`Skip ${filename}`)
        return src
      }

      // console.log(`Do ${filename}`)

      if (babel == null) {
        babel = require('@babel/core')
      }

      if (isFullyCompiled(src)) {
        // console.log(`!canCompile!o ${filename}`)
        return src
      }

      let plugins = options.plugins || []

      const lastLine = src.lastIndexOf("\n") + 1
      if (lastLine > 0 && lastLine < src.length) {
        if (src.substring(lastLine).startsWith("//#")) {
          src = src.substring(0, lastLine - 1)
        }
      }

      const finalOptions = Object.assign({}, options, {
        filename,
        plugins,
        inputSourceMap: JSON.parse(fs.readFileSync(filename + ".map", "utf-8")),
        sourceMaps: "inline",
      })
      if (transformOptions && transformOptions.instrument) {
        finalOptions.auxiliaryCommentBefore = ' istanbul ignore next '
        finalOptions.plugins = plugins.concat(require('babel-plugin-istanbul').default);
      }

      const result = babel.transform(src, finalOptions)
      return result.code + "\n//# sourceMappingURL=data:application/json;base64," + convert.fromObject(result.map).toBase64()
    }
  }
}

module.exports = createTransformer()
module.exports.createTransformer = createTransformer