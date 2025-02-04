import chalk from 'chalk'
import * as opn from 'opn'
import * as path from 'path'
import { format as formatUrl } from 'url'
import * as webpack from 'webpack'
import * as WebpackDevServer from 'webpack-dev-server'

import buildConf from './config/build.conf'
import devConf from './config/dev.conf'
import baseDevServerOption from './config/devServer.conf'
import prodConf from './config/prod.conf'
import { appPath, addLeadingSlash, addTrailingSlash, recursiveMerge } from './util'
import { bindDevLogger, bindProdLogger, printBuildError } from './util/logHelper'
import { BuildConfig } from './util/types'

const customizeChain = (chain, customizeFunc: Function) => {
  if (customizeFunc instanceof Function) {
    customizeFunc(chain, webpack)
  }
}

const warnConfigWebpack = () => {
  console.log(chalk.yellow(`taro@1.3版本开始，h5.webpack配置项已经停止支持。作为代替，请使用配置项h5.webpackChain，文档：https://nervjs.github.io/taro/docs/config-detail.html#h5webpackchain`))
}
const warnConfigEnableDll = () => {
  console.log(chalk.yellow(`taro@1.3版本开始，taro在h5端加强了代码体积控制，抽离dll的收益已经微乎其微，同时也容易导致一些问题（#1800等）。所以h5.enableDll配置项暂时移除。`))
}

const buildProd = (config: BuildConfig): Promise<void> => {
  return new Promise((resolve, reject) => {
    const webpackChain = prodConf(config)
    const webpackConfig = webpackChain.toConfig()

    customizeChain(webpackChain, config.webpackChain)

    if (config.webpack) {
      warnConfigWebpack()
    }

    const compiler = webpack(webpackConfig)
    bindProdLogger(compiler)

    compiler.run((err) => {
      if (err) {
        printBuildError(err);
        return reject(err)
      }
      resolve()
    })
  })
}

const buildDev = async (config: BuildConfig): Promise<any> => {
  return new Promise((resolve, reject) => {
    const conf = buildConf(config)
    const routerConfig = config.router || {}
    const routerMode = routerConfig.mode === 'browser' ? 'browser' : 'hash'
    const routerBasename = routerConfig.basename || '/'
    const publicPath = conf.publicPath ? addLeadingSlash(addTrailingSlash(conf.publicPath)) : '/'
    const outputPath = path.join(appPath, conf.outputRoot as string)
    const customDevServerOption = config.devServer || {}
    const webpackChain = devConf(config)
    let webpackConfig

    customizeChain(webpackChain, config.webpackChain)

    webpackConfig = webpackChain.toConfig()

    if (config.webpack) {
      warnConfigWebpack()
    }

    const devServerOptions = recursiveMerge(
      {
        publicPath,
        contentBase: outputPath,
        historyApiFallback: {
          index: publicPath
        }
      },
      baseDevServerOption,
      customDevServerOption
    )
    const devUrl = formatUrl({
      protocol: devServerOptions.https ? 'https' : 'http',
      hostname: devServerOptions.host,
      port: devServerOptions.port,
      pathname: routerMode === 'browser' ? routerBasename : '/'
    })
    WebpackDevServer.addDevServerEntrypoints(webpackConfig, devServerOptions)
    const compiler = webpack(webpackConfig)
    bindDevLogger(devUrl, compiler)
    const server = new WebpackDevServer(compiler, devServerOptions)

    server.listen(devServerOptions.port as number, devServerOptions.host as string, err => {
      if (err) {
        reject()
        return console.log(err)
      }
      resolve()

      /* 补充处理devServer.open配置 */
      if (devServerOptions.open) {
        opn(devUrl)
      }
    })
  })
}

export default async (config: BuildConfig): Promise<void> => {
  if (config.isWatch) {
    await buildDev(config)
  } else {
    if ('enableDll' in config) {
      warnConfigEnableDll()
    }
    await buildProd(config)
  }
}
