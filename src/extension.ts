import { GitHandler } from './gitHandler'
import { LibrespotNodeHandler } from './librespotNodeHandler'
import { MoosyncExtensionTemplate } from '@moosync/moosync-types'
import { OS } from './utils'
import { RustHandler } from './rustHandler'
import { YarnHandler } from './yarnHandler'
import path from 'path'

const DOWNLOAD_DIR = path.join(__dirname, 'downloads')
const BINARY_DIR = path.join(__dirname, 'bin')
const BUILD_DIR = path.join(__dirname, 'build')

export class LibrespotPatcher implements MoosyncExtensionTemplate {
  private os = this.getOS()
  private gitHandler = new GitHandler(this.os, DOWNLOAD_DIR, BINARY_DIR)
  private rustHandler = new RustHandler(this.os, DOWNLOAD_DIR, BINARY_DIR)
  private yarnHandler = new YarnHandler(this.os, DOWNLOAD_DIR, BINARY_DIR)
  private librespotNodeHandler = new LibrespotNodeHandler(this.os, BUILD_DIR)

  async onStarted(): Promise<void> {
    // const gitExec = await this.gitHandler.downloadGit()
    // const rustExecs = await this.rustHandler.downloadRust()
    // const yarnExec = await this.yarnHandler.downloadYarn()
    // await this.librespotNodeHandler.patchAndBuild(gitExec, yarnExec, rustExecs)
  }

  private getOS(): OS {
    for (const value of Object.values(OS)) {
      if (value === process.platform) return value
    }
    return OS.UNSUPPORTED
  }
}
