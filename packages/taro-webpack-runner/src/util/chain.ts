import CssoWebpackPlugin from 'csso-webpack-plugin';
import * as HtmlWebpackPlugin from 'html-webpack-plugin';
import { partial } from 'lodash';
import { mapKeys, pipe } from 'lodash/fp';
import * as MiniCssExtractPlugin from 'mini-css-extract-plugin';
import * as path from 'path';
import * as UglifyJsPlugin from 'uglifyjs-webpack-plugin';
import * as webpack from 'webpack';
import * as apis from '@tarojs/taro-h5/dist/taroApis';

import { appPath, recursiveMerge } from '.';
import { getPostcssPlugins } from '../config/postcss.conf';
import { Option, PostcssOption } from './types';

const defaultUglifyJsOption = {
  keep_fnames: true,
  output: {
    comments: false,
    keep_quoted_props: true,
    quote_keys: true,
    beautify: false
  },
  warnings: false
}

const defaultCSSCompressOption = {
  mergeRules: false,
  mergeIdents: false,
  reduceIdents: false,
  discardUnused: false,
  minifySelectors: false
}

const defaultBabelLoaderOption = {
  plugins: [
    require.resolve('babel-plugin-syntax-dynamic-import'),
    [
      require.resolve('babel-plugin-transform-react-jsx'),
      {
        pragma: 'Nerv.createElement'
      }
    ],
    [
      require.resolve('babel-plugin-transform-taroapi'),
      {
        apis,
        packageName: '@tarojs/taro-h5'
      }
    ]
  ]
}

const defaultMediaUrlLoaderOption = {
  limit: 10240
}
const defaultFontUrlLoaderOption = {
  limit: 10240
}
const defaultImageUrlLoaderOption = {
  limit: 10240
}
const defaultCssModuleOption: PostcssOption.cssModules = {
  enable: false,
  config: {
    namingPattern: 'global',
    generateScopedName: '[name]__[local]___[hash:base64:5]'
  }
}

const getLoader = (loaderName: string, options: Option) => {
  return {
    loader: require.resolve(loaderName),
    options: options || {}
  }
}

const listify = listOrItem => {
  if (Array.isArray( listOrItem )) {
    return listOrItem
  }
  return [ listOrItem ]
}

const getPlugin = (plugin: any, args: Option[]) => {
  return {
    plugin,
    args
  }
}

const mergeOption = ([...options]: Option[]): Option => {
  return recursiveMerge({}, ...options)
}

const processEnvOption = partial(mapKeys, key => `process.env.${key}`)

const getStyleLoader = pipe(mergeOption, partial(getLoader, 'style-loader'))
const getCssLoader = pipe(mergeOption, partial(getLoader, 'css-loader'))
const getPostcssLoader = pipe(mergeOption, partial(getLoader, 'postcss-loader'))
const getResolveUrlLoader = pipe(mergeOption, partial(getLoader, 'resolve-url-loader'))
const getSassLoader = pipe(mergeOption, partial(getLoader, 'sass-loader'))
const getLessLoader = pipe(mergeOption, partial(getLoader, 'less-loader'))
const getStylusLoader = pipe(mergeOption, partial(getLoader, 'stylus-loader'))
const getBabelLoader = pipe(mergeOption, partial(getLoader, 'babel-loader'))
const getUrlLoader = pipe(mergeOption, partial(getLoader, 'url-loader'))
const getExtractCssLoader = () => {
  return {
    loader: MiniCssExtractPlugin.loader
  }
}

const getMiniCssExtractPlugin = pipe(mergeOption, listify, partial(getPlugin, MiniCssExtractPlugin))
const getHtmlWebpackPlugin = pipe(mergeOption, listify, partial(getPlugin, HtmlWebpackPlugin))
const getDefinePlugin = pipe(mergeOption, listify, partial(getPlugin, webpack.DefinePlugin))
const getHotModuleReplacementPlugin = partial(getPlugin, webpack.HotModuleReplacementPlugin, [])
const getUglifyPlugin = ([enableSourceMap, uglifyOptions]) => {
  return new UglifyJsPlugin({
    cache: true,
    parallel: true,
    sourceMap: enableSourceMap,
    uglifyOptions: recursiveMerge({}, defaultUglifyJsOption, uglifyOptions)
  })
}
const getCssoWebpackPlugin = ([cssoOption]) => {
  return pipe(mergeOption, listify, partial(getPlugin, CssoWebpackPlugin))([defaultCSSCompressOption, cssoOption])
}

const getEntry = (customEntry = {}) => {
  return Object.assign(
    {
      app: path.join('.temp', 'app.js')
    },
    customEntry
  )
}

const getModule = ({
  mode,
  staticDirectory,
  designWidth,
  deviceRatio,
  enableExtract,
  enableSourceMap,

  styleLoaderOption,
  cssLoaderOption,
  lessLoaderOption,
  sassLoaderOption,
  stylusLoaderOption,
  fontUrlLoaderOption,
  imageUrlLoaderOption,
  mediaUrlLoaderOption,
  esnextModules = [] as (string | RegExp)[],

  module,
  plugins
}) => {

  const postcssOption: PostcssOption = module.postcss || {}

  const defaultStyleLoaderOption = {
    sourceMap: enableSourceMap,
    singleton: true
  }

  const styleLoader = getStyleLoader([
    defaultStyleLoaderOption,
    styleLoaderOption
  ])
  const topStyleLoader = getStyleLoader([
    defaultStyleLoaderOption,
    { insertAt: 'top' },
    styleLoaderOption
  ])

  const extractCssLoader = getExtractCssLoader()

  const lastStyleLoader = enableExtract ? extractCssLoader : styleLoader

  const cssModuleOptions: PostcssOption.cssModules = recursiveMerge({}, defaultCssModuleOption, postcssOption.cssModules)

  const cssOptions = [
    {
      importLoaders: 1,
      sourceMap: enableSourceMap,
      modules: false
    },
    cssLoaderOption
  ]
  const cssOptionsWithModule = [
    {
      importLoaders: 1,
      sourceMap: enableSourceMap,
      modules: cssModuleOptions.config!.namingPattern === 'module' ? true : 'global',
      localIdentName: cssModuleOptions.config!.generateScopedName
    },
    cssLoaderOption
  ]
  /**
   * css-loader 1.0.0版本移除了minimize选项...升级需谨慎
   *
   * https://github.com/webpack-contrib/css-loader/releases/tag/v1.0.0
   */
  const cssLoader = getCssLoader(cssOptions)
  const cssLoaders = [{
    use: [cssLoader]
  }]

  if (cssModuleOptions.enable) {
    const cssLoaderWithModule = getCssLoader(cssOptionsWithModule)
    let cssModuleConditionName
    let cssModuleCondition

    if (cssModuleOptions.config!.namingPattern === 'module') {
      cssModuleConditionName = 'include'
      cssModuleCondition = {
        and: [
          { include: /(.*\.module).*\.(css|s[ac]ss|less|styl)\b/},
          { exclude: /\bnode_modules\b/ }
        ]
      }
    } else {
      cssModuleConditionName = 'include'
      cssModuleCondition = {
        and: [
          { exclude: /(.*\.global).*\.(css|s[ac]ss|less|styl)\b/ },
          { exclude: /\bnode_modules\b/ }
        ]
      }
    }
    cssLoaders.unshift({
      [cssModuleConditionName]: [cssModuleCondition],
      use: [cssLoaderWithModule]
    })
  }

  const postcssLoader = getPostcssLoader([
    { sourceMap: enableSourceMap },
    {
      ident: 'postcss',
      plugins: getPostcssPlugins({
        designWidth,
        deviceRatio,
        postcssOption
      })
    }
  ])

  const resolveUrlLoader = getResolveUrlLoader([])

  const sassLoader = getSassLoader([{ sourceMap: true }, sassLoaderOption])

  const lessLoader = getLessLoader([{ sourceMap: enableSourceMap }, lessLoaderOption])

  const stylusLoader = getStylusLoader([{ sourceMap: enableSourceMap }, stylusLoaderOption])

  const rule: {
    [key: string]: any
  } = {}

  rule.sass = {
    test: /\.(s[ac]ss)\b/,
    enforce: 'pre',
    use: [resolveUrlLoader, sassLoader]
  }
  rule.less = {
    test: /\.less\b/,
    enforce: 'pre',
    use: [lessLoader]
  }
  rule.styl = {
    test: /\.styl\b/,
    enforce: 'pre',
    use: [stylusLoader]
  }
  rule.css = {
    test: /\.(css|s[ac]ss|less|styl)\b/,
    oneOf: cssLoaders
  }
  rule.postcss = {
    test: /\.(css|s[ac]ss|less|styl)\b/,
    use: [postcssLoader]
  }
  rule.taroStyle = {
    test: /\.(css|s[ac]ss|less|styl)\b/,
    enforce: 'post',
    use: [topStyleLoader]
  }
  rule.customStyle = {
    test: /\.(css|s[ac]ss|less|styl)\b/,
    enforce: 'post',
    use: [lastStyleLoader]
  }

  const additionalBabelOptions = {
    ...plugins.babel,
    sourceMap: enableSourceMap
  }
  rule.jsx = {
    use: {
      babelLoader: {
        options: additionalBabelOptions
      }
    }
  }
  rule.media = {
    use: {
      urlLoader: {
        options: {
          name: `${staticDirectory}/media/[name].[ext]`,
          ...mediaUrlLoaderOption
        }
      }
    }
  }
  rule.font = {
    use: {
      urlLoader: {
        options: {
          name: `${staticDirectory}/fonts/[name].[ext]`,
          ...fontUrlLoaderOption
        }
      }
    }
  }
  rule.image = {
    use: {
      urlLoader: {
        options: {
          name: `${staticDirectory}/images/[name].[ext]`,
          ...imageUrlLoaderOption
        }
      }
    }
  }

  const isNodemodule = filename => /\bnode_modules\b/.test(filename)
  const taroModuleRegs = [
    /@tarojs[/\\_]components/, /\btaro-components\b/
  ]
  let esnextModuleRegs = [
    /@tarojs[/\\_]components/, /\btaro-components\b/,
    /@tarojs[/\\_]taro-h5/, /\btaro-h5\b/,
    /@tarojs[/\\_]router/, /\btaro-router\b/,
    /@tarojs[/\\_]redux-h5/, /\btaro-redux-h5\b/
  ]
  if (Array.isArray(esnextModules) && esnextModules.length) {
    /* cnpm 安装的模块名前带下划线 `_` */
    esnextModuleRegs = esnextModuleRegs.concat([
      ...esnextModules.map(v => {
        if (typeof v === 'string') {
          return new RegExp(`\b${v}\b`)
        } else {
          return v
        }
      })
    ])
  }
  /**
   * isEsnextModule
   *
   * 使用正则匹配判断是否是es模块
   * 规则参考：https://github.com/webpack/webpack/blob/master/lib/RuleSet.js#L413
   */
  const isEsnextModule = filename => esnextModuleRegs.some(reg => reg.test(filename))
  const isTaroModule = filename => taroModuleRegs.some(reg => reg.test(filename))

  /* 通过taro处理 */
  rule.jsx.exclude = [filename => {
    if (isEsnextModule(filename)) {
      return false
    } else {
      return isNodemodule(filename)
    }
  }]
  rule.postcss.exclude = [filename => {
    if (isTaroModule(filename)) {
      return true
    } else if (isEsnextModule(filename)) {
      return false
    } else {
      return isNodemodule(filename)
    }
  }]
  rule.taroStyle.include = [filename => isTaroModule(filename)]
  rule.customStyle.exclude = [filename => isTaroModule(filename)]

  return { rule }
}

const getOutput = ([{ outputRoot, publicPath, chunkDirectory }, customOutput]) => {
  return Object.assign(
    {
      path: path.join(appPath, outputRoot),
      filename: 'js/[name].js',
      chunkFilename: `${chunkDirectory}/[name].js`,
      publicPath
    },
    customOutput
  )
}

const getDevtool = enableSourceMap => {
  return enableSourceMap ? 'cheap-module-eval-source-map' : 'none'
}

export { getStyleLoader, getCssLoader, getPostcssLoader, getResolveUrlLoader, getSassLoader, getLessLoader, getStylusLoader, getExtractCssLoader, getEntry, getOutput, getMiniCssExtractPlugin, getHtmlWebpackPlugin, getDefinePlugin, processEnvOption, getHotModuleReplacementPlugin, getModule, getUglifyPlugin, getDevtool, getCssoWebpackPlugin, getBabelLoader, defaultBabelLoaderOption, getUrlLoader, defaultMediaUrlLoaderOption, defaultFontUrlLoaderOption, defaultImageUrlLoaderOption }
