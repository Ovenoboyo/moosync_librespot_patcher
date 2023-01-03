import { downloadFile, execAsync, extractArchive, log, OS, spawnAsync } from './utils'
import axios from 'axios'
import { promises as fs } from 'fs'
import path from 'path'
import { checkFile } from './utils'

export class GitHandler {
  private os: OS
  private DOWNLOAD_DIR: string
  private BINARY_DIR: string

  constructor(os: OS, downloadDir: string, binaryDir: string) {
    this.os = os
    this.DOWNLOAD_DIR = downloadDir
    this.BINARY_DIR = binaryDir
  }

  private getHashFromBody(body: string, match: string, separator = ' ', index = 0) {
    const split = body.split('\n')
    for (const s of split) {
      if (s.match(new RegExp(match, 'g'))) {
        return s.split(separator)[index]
      }
    }
  }

  private async compileGit(extractDir: string, version: string) {
    return spawnAsync(
      `make configure && chmod +x ./configure && ./configure --prefix ${extractDir}/ && make all && make install`,
      {
        cwd: path.join(extractDir, `git-${version}`),
        shell: true
      }
    )
  }

  private async findGitExec(extractDir?: string) {
    let gitDir
    if (this.os === OS.WIN32) {
      if (!extractDir) {
        gitDir = (await execAsync('where git'))[1].trim()
      } else {
        gitDir = path.join(extractDir, 'cmd', 'git.exe')
      }
    }

    if (this.os === OS.LINUX) {
      if (!extractDir) {
        gitDir = (await execAsync('which git'))[1].trim()
      } else {
        gitDir = path.join(extractDir, 'bin', 'git')
      }
    }

    try {
      console.log('Checking git at', gitDir)
      await fs.access(gitDir ?? '')
      return gitDir
    } catch {}
  }

  public async downloadGit() {
    const data = await this.findGitExec()
    if (data) return data

    let version: string
    let filePath: string
    let downloadUrl: string
    let hash: string

    if (this.os === OS.WIN32) {
      const latestTag = (await axios.get(`https://api.github.com/repos/git-for-windows/git/releases`)).data[0]
      version = latestTag.tag_name.replace('.windows.1', '').replace('v', '')
      hash = this.getHashFromBody(latestTag.body, `MinGit-${version}-64-bit.zip`, '|', 1)

      for (const a of latestTag.assets) {
        const name: string = a.name
        if (name.match(new RegExp(`MinGit-${version}-64-bit.zip`, 'g'))) {
          downloadUrl = a.browser_download_url
          break
        }
      }
    }

    if (this.os === OS.LINUX) {
      const tags = (await axios.get('https://api.github.com/repos/git/git/tags')).data
      for (const t of tags) {
        if (!t.name.includes('rc')) {
          version = t.name.replace('v', '')
          filePath = path.join(this.DOWNLOAD_DIR, `git-${version}.tar.gz`)
          downloadUrl = `https://www.kernel.org/pub/software/scm/git/git-${version}.tar.gz`

          const checksums = (await axios.get('https://mirrors.edge.kernel.org/pub/software/scm/git/sha256sums.asc'))
            .data
          hash = this.getHashFromBody(checksums, `git-${version}.tar.gz`)
          break
        }
      }
    }

    if (!downloadUrl) {
      throw new Error('Failed to find download URL for git')
    }

    if (!(await checkFile(filePath, hash))) {
      console.debug('Downloading git portable from', downloadUrl)
      await downloadFile(downloadUrl, filePath)
    }

    const extractDir = await extractArchive(
      filePath,
      path.join(this.BINARY_DIR, path.basename(filePath).replace(path.extname(filePath), ''))
    )
    if (this.os === OS.LINUX) {
      log('Compiling git...')
      await this.compileGit(extractDir, version)
    }
    return await this.findGitExec(extractDir)
  }
}
