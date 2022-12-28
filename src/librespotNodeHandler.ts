import { makeDir, OS, spawnAsync, log } from './utils'

import { fork } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { readFile, writeFile, access, copyFile, unlink } from 'fs/promises'

export class LibrespotNodeHandler {
  private buildDir: string
  private os: OS

  constructor(os: OS, buildDir: string) {
    this.buildDir = buildDir
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

    data.splice(254, 9)

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

  private async cloneLibrespotAndPatch(gitExec: string) {
    const clonePath = path.join(this.buildDir, 'librespot-node', 'native', 'librespot-custom')
    try {
      await fs.access(clonePath)
      await fs.rm(clonePath, { recursive: true, force: true, maxRetries: 3 })
    } catch {}

    await spawnAsync(
      `"${path.basename(gitExec)}" clone https://github.com/librespot-org/librespot -b dev librespot-custom`,
      {
        cwd: path.join(this.buildDir, 'librespot-node', 'native'),
        shell: true
      }
    )

    await this.patchSession(clonePath)
    await this.patchCargo(clonePath)
    await this.patchBitrate(clonePath)
  }

  private async cloneRepo(gitExec: string) {
    const clonePath = path.join(this.buildDir, 'librespot-node')

    try {
      await fs.access(clonePath)
      await fs.rm(clonePath, { recursive: true, force: true, maxRetries: 3 })
    } catch {}

    await spawnAsync(`"${path.basename(gitExec)}" clone https://github.com/Moosync/librespot-node`, {
      cwd: this.buildDir,
      shell: true
    })

    return clonePath
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

    let replacePath: string

    if (process.env.installPath.endsWith('asar')) {
      replacePath = path.join(
        process.env.installPath,
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
      await unlink(replacePath)
    } catch (e) {
      console.error(e)
    }

    try {
      log('  \nreplacing file at', replacePath)
      await copyFile(compiled, replacePath)

      log('### Patch completed. Please restart the app')
    } catch (e) {
      console.error(e)
    }
  }
}
