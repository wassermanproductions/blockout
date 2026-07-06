/**
 * Typed IPC bridge. The renderer sees exactly this surface as
 * window.blockout — nothing else from Node.
 */

import { contextBridge, ipcRenderer } from 'electron'

export interface BlockoutAPI {
  newProjectDialog(): Promise<string | null>
  openProjectDialog(): Promise<string | null>
  pickFile(filters: { name: string; extensions: string[] }[]): Promise<string | null>
  saveProject(folder: string, json: string): Promise<boolean>
  saveBackup(folder: string, json: string): Promise<boolean>
  loadProject(folder: string): Promise<{
    json: string | null
    backupJson: string | null
    backupNewer: boolean
    folder: string
  }>
  importAsset(folder: string, sourcePath: string): Promise<{ relativePath: string; name: string }>
  readProjectFile(folder: string, relativePath: string): Promise<ArrayBuffer>
  showFolder(path: string): Promise<void>
  exportBegin(
    jobId: string,
    outPath: string,
    opts: { fps: number; width: number; height: number; framesExpected: number }
  ): Promise<boolean>
  exportFrame(jobId: string, png: ArrayBuffer): Promise<boolean>
  exportEnd(jobId: string): Promise<boolean>
  exportCancel(jobId: string): Promise<boolean>
  exportWriteFile(path: string, data: ArrayBuffer | string): Promise<boolean>
  exportConcat(outPath: string, inputPaths: string[]): Promise<{ ok: boolean; error?: string }>
  onExportClosed(cb: (jobId: string, code: number, log: string) => void): () => void
  versions(): Promise<{ app: string; electron: string; node: string }>
}

const api: BlockoutAPI = {
  newProjectDialog: () => ipcRenderer.invoke('dialog:newProject'),
  openProjectDialog: () => ipcRenderer.invoke('dialog:openProject'),
  pickFile: (filters) => ipcRenderer.invoke('dialog:pickFile', filters),
  saveProject: (folder, json) => ipcRenderer.invoke('project:save', folder, json),
  saveBackup: (folder, json) => ipcRenderer.invoke('project:saveBackup', folder, json),
  loadProject: (folder) => ipcRenderer.invoke('project:load', folder),
  importAsset: (folder, sourcePath) => ipcRenderer.invoke('project:importAsset', folder, sourcePath),
  readProjectFile: (folder, rel) => ipcRenderer.invoke('file:readAbsolute', folder, rel),
  showFolder: (path) => ipcRenderer.invoke('shell:showFolder', path),
  exportBegin: (jobId, outPath, opts) => ipcRenderer.invoke('export:begin', jobId, outPath, opts),
  exportFrame: (jobId, png) => ipcRenderer.invoke('export:frame', jobId, png),
  exportEnd: (jobId) => ipcRenderer.invoke('export:end', jobId),
  exportCancel: (jobId) => ipcRenderer.invoke('export:cancel', jobId),
  exportWriteFile: (path, data) => ipcRenderer.invoke('export:writeFile', path, data),
  exportConcat: (outPath, inputPaths) => ipcRenderer.invoke('export:concat', outPath, inputPaths),
  onExportClosed: (cb) => {
    const listener = (_e: unknown, jobId: string, code: number, log: string) => cb(jobId, code, log)
    ipcRenderer.on('export:closed', listener)
    return () => ipcRenderer.removeListener('export:closed', listener)
  },
  versions: () => ipcRenderer.invoke('app:versions')
}

contextBridge.exposeInMainWorld('blockout', api)
