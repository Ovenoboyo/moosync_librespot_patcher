import { GitHandler } from './gitHandler'
import { LibrespotNodeHandler } from './librespotNodeHandler'
import { MoosyncExtensionTemplate, Buttons } from '@moosync/moosync-types'
import { clearOutput, log, OS } from './utils'
import { RustHandler } from './rustHandler'
import { YarnHandler } from './yarnHandler'
import path from 'path'

const DOWNLOAD_DIR = path.join(__dirname, 'downloads')
const BUILD_DIR = path.join(__dirname, 'build')

export class LibrespotPatcher implements MoosyncExtensionTemplate {
  private os = this.getOS()

  private isPatchInProgress = false

  async onStarted(): Promise<void> {
    clearOutput()
    await this.setDefaultDirs()

    api.on('preferenceChanged', async ({ key, value }) => {
      if (key === 'buttons') {
        const buttonPressed = (value as Buttons[]).sort((a, b) => b.lastClicked - a.lastClicked)[0]

        if (buttonPressed.key === 'start') {
          api.addUserPreference({
            type: 'ProgressBar',
            key: 'patch-progress',
            default: 0,
            index: 0
          })

          api.addUserPreference({
            type: 'TextField',
            key: 'patch-progress-output',
            default: '',
            index: 1
          })

          this.patchLibrespot()
        }
      }
    })
  }

  async onStopped() {
    clearOutput()
  }

  private async setDefaultDirs() {
    const downloadDir = await api?.getPreferences<string>('download-dir')
    if (!downloadDir) {
      await api?.setPreferences('download-dir', DOWNLOAD_DIR)
    }

    const buildDir = await api?.getPreferences<string>('build-dir')
    if (!buildDir) {
      await api?.setPreferences('build-dir', BUILD_DIR)
    }
  }

  private async setProgress(progress: number) {
    await api?.setPreferences('patch-progress', progress)
  }

  public async patchLibrespot() {
    if (!this.isPatchInProgress) {
      this.isPatchInProgress = true

      clearOutput()

      await this.setProgress(0)

      const downloadDir = (await api?.getPreferences<string>('download-dir')) ?? DOWNLOAD_DIR
      const buildDir = (await api?.getPreferences<string>('build-dir')) ?? BUILD_DIR
      const binaryDir = path.join(downloadDir, 'bin')

      const gitHandler = new GitHandler(this.os, downloadDir, binaryDir)
      const rustHandler = new RustHandler(this.os, downloadDir, binaryDir)
      const yarnHandler = new YarnHandler(this.os, downloadDir, binaryDir)
      const librespotNodeHandler = new LibrespotNodeHandler(this.os, buildDir, binaryDir)

      // const gitExec = await gitHandler.downloadGit()
      const gitExec = undefined
      await this.setProgress(1 * (100 / 4))

      const rustExecs = await rustHandler.downloadRust()
      await this.setProgress(2 * (100 / 4))

      const yarnExec = await yarnHandler.downloadYarn()
      await this.setProgress(3 * (100 / 4))

      await librespotNodeHandler.patchAndBuild(gitExec, yarnExec, rustExecs)
      await this.setProgress(4 * (100 / 4))

      this.isPatchInProgress = false
    } else {
      console.warn('Patch already in progress')
    }
  }

  private getOS(): OS {
    for (const value of Object.values(OS)) {
      if (value === process.platform) return value
    }
    return OS.UNSUPPORTED
  }
}

// ;(global as any).api = undefined
// new LibrespotPatcher().patchLibrespot()
