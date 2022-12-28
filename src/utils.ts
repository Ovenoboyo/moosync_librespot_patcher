import { promises as fs, createWriteStream, createReadStream } from 'fs'
import crypto from 'crypto'
import gunzip from 'gunzip-maybe'
import tar from 'tar-stream'
import path from 'path'
import AdmZip from 'adm-zip'
import { ExecException, exec, SpawnOptionsWithoutStdio, spawn } from 'child_process'
import https from 'https'
import http from 'http'

export enum OS {
  LINUX = 'linux',
  WIN32 = 'win32',
  // MACOS = 'darwin',
  UNSUPPORTED = 'unsupported'
}

export async function makeDir(dir: string) {
  try {
    await fs.access(dir)
  } catch {
    await fs.mkdir(dir, { recursive: true })
  }
}

export async function removeFile(filepath: string) {
  try {
    await fs.unlink(filepath)
  } catch {}
}

export async function checkFile(filepath: string, sha256: string) {
  try {
    await fs.access(filepath)
    const fileBuffer = await fs.readFile(filepath)
    const hashSum = crypto.createHash('sha256')

    hashSum.update(fileBuffer)

    const hex = hashSum.digest('hex')

    const ret = hex === sha256.trim()
    if (!ret) {
      log('Expected:', sha256, 'got:', hex)
    }
    return ret
  } catch {
    return false
  }
}

export async function downloadFile(url: string, fileName: string) {
  await makeDir(path.dirname(fileName))
  await removeFile(fileName)

  const parsedURL = new URL(url)
  const module = parsedURL.protocol === 'https:' ? https : http

  const writer = createWriteStream(fileName)
  let finishedPromise = new Promise<void>((r) =>
    writer.on('finish', () => {
      writer.close()
      r()
    })
  )

  let downloaded = false
  while (!downloaded) {
    await new Promise<void>((resolve) => {
      module.get(url, (resp) => {
        resolve()
        if ([301, 302].includes(resp.statusCode)) {
          log('redirecting to', resp.headers.location)
          url = resp.headers.location
        } else {
          downloaded = true
          resp.pipe(writer)
        }
      })
    })
  }

  await finishedPromise
}

export async function extractArchive(fileName: string, extractDir: string) {
  log('extracting', fileName, 'to', extractDir)
  await makeDir(extractDir)

  if (fileName.endsWith('.zip')) {
    const zip = new AdmZip(fileName)
    await new Promise<void>((resolve, reject) => {
      zip.extractAllToAsync(extractDir, true, true, (e) => {
        if (e) {
          reject(e)
          return
        }
        resolve()
      })
    })
  }

  // IDK somehow resolve all tar extensions
  if (fileName.endsWith('.tar.gz')) {
    const gzip = createReadStream(fileName).pipe(gunzip(100))
    const ext = gzip.pipe(tar.extract())

    await new Promise<void>((resolve, reject) => {
      ext.on('entry', (header, stream, next) => {
        makeDir(path.join(extractDir, path.dirname(header.name))).then(() => {
          if (header.type !== 'directory') {
            stream.on('end', () => {
              return next()
            })

            stream.pipe(createWriteStream(path.join(extractDir, header.name)))
          } else {
            next()
          }
        })
      })

      ext.on('finish', () => {
        resolve()
      })

      ext.on('error', (e: Error) => {
        console.error(e)
        reject(e)
      })
    })
  }

  return extractDir
}

export function execAsync(cmd: string) {
  return new Promise<[ExecException, string, string]>((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve([error, stdout, stderr])
    })
  })
}

export function spawnAsync(cmd: string, options: SpawnOptionsWithoutStdio) {
  return new Promise<void>((resolve, reject) => {
    const process = spawn(cmd, options)

    process.stdout.on('data', (d) => log(d.toString()))
    process.stderr.on('data', (d) => log(d.toString()))
    process.on('error', reject)
    process.on('close', resolve)
  })
}

let totalOutput = ''
export function updateOutput(...output: unknown[]) {
  for (const o of output) {
    totalOutput += o.toString().trim() + ' '
  }
  totalOutput += '  \n'
  api?.setPreferences('patch-progress-output', totalOutput)
}

export function clearOutput() {
  totalOutput = ''
  api?.setPreferences('patch-progress-output', '')
}

export function log(...output: unknown[]) {
  console.log(...output)
  updateOutput(...output)
}
