import { makeDir, spawnAsync } from './utils'

import { fork } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

export class LibrespotNodeHandler {
  private buildDir: string

  constructor(buildDir: string) {
    this.buildDir = buildDir
  }

  public async patchAndBuild(gitExec: string, yarnExec: string, rustExecs: string[]) {
    await makeDir(this.buildDir)
    const clonePath = await this.cloneRepo(gitExec)
    await this.compile(yarnExec, rustExecs, clonePath)
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
        env: {
          ...process.env,
          PATH: `${process.env.PATH}${path.delimiter}${path.dirname(cargoExec)}`,
          CARGO_HOME: CARGO_HOME ?? process.env.CARGO_HOME,
          RUSTUP_HOME: RUSTUP_HOME ?? process.env.RUSTUP_HOME
        }
      })

      p.on('close', resolve)
    })
  }
}
