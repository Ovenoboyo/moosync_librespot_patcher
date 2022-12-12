import { checkFile, downloadFile, execAsync, extractArchive, makeDir, OS } from './utils'
import path from 'path'
import { promises as fs } from 'fs'
import axios from 'axios'

export class YarnHandler {
  private os: OS
  private DOWNLOAD_DIR: string
  private BINARY_DIR: string

  constructor(os: OS, downloadDir: string, binaryDir: string) {
    this.os = os
    this.DOWNLOAD_DIR = downloadDir
    this.BINARY_DIR = binaryDir
  }

  private async findYarnExec(extractDir?: string, version?: string) {
    let yarnDir: string
    if (!extractDir) {
      yarnDir = (await execAsync(`${this.os === OS.WIN32 ? 'where' : 'which'} yarn`))[1].trim()
    } else {
      yarnDir = path.join(extractDir, `yarn-${version}`, 'bin', 'yarn.js')
    }

    try {
      await fs.access(yarnDir)
      return yarnDir
    } catch {}
  }

  public async downloadYarn() {
    let downloadUrl: string
    let filePath: string

    downloadUrl = 'https://github.com/yarnpkg/yarn/releases/download/v1.22.19/yarn-v1.22.19.tar.gz'
    filePath = path.join(this.DOWNLOAD_DIR, 'yarn-v1.22.19.tar.gz')

    if (!(await checkFile(filePath, '732620bac8b1690d507274f025f3c6cfdc3627a84d9642e38a07452cc00e0f2e'))) {
      await downloadFile(downloadUrl, filePath)
    }

    const extractDir = path.join(this.BINARY_DIR, path.basename(filePath).replace(path.extname(filePath), ''))
    await extractArchive(filePath, extractDir)

    return await this.findYarnExec(extractDir, 'v1.22.19')
  }
}
