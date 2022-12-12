import { OS, checkFile, downloadFile, execAsync, extractArchive, spawnAsync } from './utils'

import { promises as fs } from 'fs'
import path from 'path'

export class RustHandler {
  private os: OS
  private DOWNLOAD_DIR: string
  private BINARY_DIR: string

  constructor(os: OS, downloadDir: string, binaryDir: string) {
    this.os = os
    this.DOWNLOAD_DIR = downloadDir
    this.BINARY_DIR = binaryDir
  }

  private async findCargoExec(extractDir?: string) {
    let rustDir: string
    if (this.os === OS.WIN32) {
      if (!extractDir) {
        rustDir = (await execAsync('where cargo'))[1].trim()
      } else {
        rustDir = path.join(extractDir, 'cargo', 'bin', 'cargo.exe')
      }
    }

    if (this.os === OS.LINUX) {
      if (!extractDir) {
        rustDir = (await execAsync('which cargo'))[1].trim()
      } else {
        rustDir = path.join(extractDir, 'cargo', 'bin', 'cargo')
      }
    }

    try {
      await fs.access(rustDir)
      return rustDir
    } catch {}
  }

  public async downloadRust() {
    // const cargoExec = await this.findCargoExec()

    // if (cargoExec) {
    //   return [cargoExec, undefined, undefined]
    // }

    let downloadUrl: string
    let filePath: string
    let hash: string
    if (this.os === OS.LINUX) {
      downloadUrl = 'https://sh.rustup.rs'
      filePath = 'rustup-init.sh'
      hash = '173f4881e2de99ba9ad1acb59e65be01b2a44979d83b6ec648d0d22f8654cbce'
    }

    if (this.os === OS.WIN32) {
      downloadUrl = 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'
      filePath = 'rustup-init.exe'
      hash = '2220ddb49fea0e0945b1b5913e33d66bd223a67f19fd1c116be0318de7ed9d9c'
    }

    filePath = path.join(this.DOWNLOAD_DIR, filePath)
    if (!(await checkFile(filePath, hash))) {
      await downloadFile(downloadUrl, filePath)
      await fs.chmod(filePath, 0x777)
    }

    const extractDir = path.join(this.BINARY_DIR, path.basename(filePath).replace(path.extname(filePath), ''))
    const CARGO_HOME = path.join(extractDir, 'cargo')
    const RUSTUP_HOME = path.join(extractDir, 'rustup')

    await spawnAsync(
      `${this.os === OS.LINUX ? './' : ''}${path.basename(filePath)} -v -y --profile minimal --no-modify-path`,
      {
        cwd: path.dirname(filePath),
        shell: true,
        env: {
          ...process.env,
          CARGO_HOME: path.join(extractDir, 'cargo'),
          RUSTUP_HOME: path.join(extractDir, 'rustup')
        }
      }
    )

    return [await this.findCargoExec(extractDir), CARGO_HOME, RUSTUP_HOME]
  }
}
