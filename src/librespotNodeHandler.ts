import { makeDir, OS, spawnAsync, log, sudoExecAsync, downloadFile, execAsync, extractArchive } from './utils'

import { fork } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { readFile, writeFile, access, copyFile, unlink } from 'fs/promises'

export class LibrespotNodeHandler {
  private buildDir: string
  private binaryDir: string
  private os: OS

  constructor(os: OS, buildDir: string, binaryDir: string) {
    this.buildDir = buildDir
    this.binaryDir = binaryDir
    this.os = os
  }

  public async patchAndBuild(gitExec: string, yarnExec: string, rustExecs: string[]) {
    await makeDir(this.buildDir)
    const clonePath = await this.cloneRepo(gitExec)
    await this.cloneLibrespotAndPatch(gitExec)
    await this.compile(yarnExec, rustExecs, clonePath)
  }

  private async patchSession(clonePath: string) {
    const file = path.join(clonePath, 'core', 'src', 'session.rs')
    const data = (
      await readFile(file, {
        encoding: 'utf-8'
      })
    ).split('\n')

    data.splice(298, 9)

    await writeFile(file, data.join('\n'), { encoding: 'utf-8' })
  }

  private async patchCargo(clonePath: string) {
    const file = path.join(clonePath, '..', 'Cargo.toml')
    const data = (
      await readFile(file, {
        encoding: 'utf-8'
      })
    ).replace('git = "https://github.com/librespot-org/librespot", branch = "dev"', 'path = "./librespot-custom"')

    await writeFile(file, data, { encoding: 'utf-8' })
  }

  private async patchBitrate(clonePath: string) {
    const file = path.join(clonePath, '..', 'src', 'utils.rs')
    const data = (await readFile(file, { encoding: 'utf-8' })).replace(
      new RegExp(
        /Bitrate::from_str\(obj\.get::<JsString, _, _>\(cx, "bitrate"\)\?\.value\(cx\)\.as_str\(\)\).\s+\.unwrap_or_default\(\)/gs
      ),
      'Bitrate::Bitrate160'
    )

    await writeFile(file, data, { encoding: 'utf-8' })
  }

  // Fallback only works with Github
  private async gitClone(gitExec: string, url: string, branch: string, clonePath: string) {
    if (gitExec) {
      try {
        await fs.access(clonePath)
        await fs.rm(clonePath, { recursive: true, force: true, maxRetries: 3 })
      } catch { }

      await spawnAsync(`"${path.basename(gitExec)}" clone ${url} -b ${branch} ${path.basename(clonePath)}`, {
        cwd: path.dirname(clonePath),
        shell: true
      })
    } else {
      const downloadFileName = path.join(this.buildDir, path.basename(clonePath) + '.tar.gz')
      await downloadFile(`${url}/archive/refs/heads/${branch}.tar.gz`, downloadFileName)

      await extractArchive(downloadFileName, path.dirname(clonePath))
      console.log(path.join(path.dirname(clonePath), `${new URL(url).pathname.split('/')?.at(-1)}-${branch}`))
      try {
        await fs.unlink(clonePath)
      } catch (e) {
        console.log(e)
      }
      await fs.rename(
        path.join(path.dirname(clonePath), `${new URL(url).pathname.split('/')?.at(-1)}-${branch}`),
        clonePath
      )
    }
  }

  private async cloneLibrespotAndPatch(gitExec: string) {
    const clonePath = path.join(this.buildDir, 'librespot-node', 'native', 'librespot-custom')
    await this.gitClone(gitExec, 'https://github.com/librespot-org/librespot', 'dev', clonePath)

    await this.patchSession(clonePath)
    await this.patchCargo(clonePath)
    await this.patchBitrate(clonePath)
  }

  private async cloneRepo(gitExec: string) {
    const clonePath = path.join(this.buildDir, 'librespot-node')

    await this.gitClone(gitExec, 'https://github.com/Moosync/librespot-node', 'main', clonePath)

    log('changing npm to yarn')
    await this.changeNPMToYarn(clonePath)

    return clonePath
  }

  private async changeNPMToYarn(clonePath: string) {
    const file = path.join(clonePath, 'package.json')
    const data = await readFile(file, {
      encoding: 'utf-8'
    })

    await writeFile(file, data.replaceAll('npm run', 'yarn'), { encoding: 'utf-8' })
  }

  private async copyToNonPortable(compiled: string) {
    let replacePath: string

    if (process.env.installPath.endsWith('asar')) {
      replacePath = path.join(
        path.dirname(process.env.installPath),
        'app.asar.unpacked',
        'node_modules',
        'librespot-node',
        'dist',
        'build',
        'librespot.node'
      )
    } else {
      replacePath = path.join(
        process.env.installPath,
        '../',
        'node_modules',
        'librespot-node',
        'dist',
        'build',
        'librespot.node'
      )
    }

    try {
      log(`Copied build to ${replacePath}`)
      await unlink(replacePath)
      await copyFile(compiled, replacePath)
    } catch (e) {
      console.warn(e)
      if (e.code === 'EACCES' || e.code === 'ENOENT') {
        try {
          await sudoExecAsync(`rm -f ${replacePath} && cp ${compiled} ${replacePath}`)
        } catch (e) {
          log(e)
          return
        }

        log('### Patch completed. Please restart the app')
        return
      } else {
        log(e)
      }
    }
  }

  private async getAppImageTool() {
    const downloadPath = path.join(this.binaryDir, 'appimagetool')
    await downloadFile(
      'https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage',
      downloadPath
    )

    await fs.chmod(downloadPath, 0x555)

    return downloadPath
  }

  private async extractAppImage() {
    const appImagePath = process.env.APPIMAGE
    const extractPath = path.join(this.buildDir, 'appimage-ext')
    await makeDir(path.join(this.buildDir, 'appimage-ext'))
    await execAsync(`cd ${extractPath} && ${appImagePath} --appimage-extract`)

    return path.join(extractPath, 'squashfs-root')
  }

  private async repackAppImage(appImageToolPath: string, extractPath: string) {
    await execAsync(`${appImageToolPath} ${extractPath}`)
    return path.resolve('./Moosync-x86_64.AppImage')
  }

  private async copyToAppImage(compiled: string) {
    const appImageTool = await this.getAppImageTool()
    const extractPath = await this.extractAppImage()

    log(`Extracted AppImage to ${extractPath}`)

    const replacePath = path.join(
      extractPath,
      'resources',
      'app.asar.unpacked',
      'node_modules',
      'librespot-node',
      'dist',
      'build',
      'librespot.node'
    )

    try {
      await unlink(replacePath)
      log(`Deleted ${replacePath}`)

      await copyFile(compiled, replacePath)
      log(`Copied build to ${process.env.APPIMAGE}`)

      const repackedImage = await this.repackAppImage(appImageTool, extractPath)

      await unlink(process.env.APPIMAGE)
      await fs.rename(repackedImage, process.env.APPIMAGE)
      log(`Repacked App Image`)

    } catch (e) {
      log(e)
    }
  }

  private async compile(yarnExec: string, [cargoExec, CARGO_HOME, RUSTUP_HOME]: string[], cloneDir: string) {
    await new Promise<void>((resolve) => {
      const p = fork(yarnExec, ['install'], {
        cwd: cloneDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          PATH: `${process.env.PATH}${path.delimiter}${path.dirname(cargoExec)}`,
          CARGO_HOME: CARGO_HOME ?? process.env.CARGO_HOME,
          RUSTUP_HOME: RUSTUP_HOME ?? process.env.RUSTUP_HOME
        }
      })
      p.once('spawn', () => {
        log('Starting compilation')
        p.stdout?.on('data', (d) => log(d.toString()))
        p.stderr?.on('data', (d) => log(d.toString()))
      })
      p.on('close', resolve)
    })
    const compiled = path.join(cloneDir, 'dist', 'build', 'librespot.node')
    await access(compiled)
    if (process.env.APPIMAGE) {
      await this.copyToAppImage(compiled)
    } else {
      await this.copyToNonPortable(compiled)
    }
  }
}
