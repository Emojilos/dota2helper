/** Барель установщика GSI-конфига (TASK-006). */
export { buildGsiConfigContent, type GsiConfigOptions } from './buildGsiConfigContent'
export {
  listCandidateDotaInstallRoots,
  findDotaCfgDir,
  cfgDirFromInstallRoot,
  type CandidateRootsOptions,
  type DotaCfgLocation
} from './findDotaCfgDir'
export {
  GsiConfigInstaller,
  DEFAULT_GSI_CONFIG_FILE_NAME,
  type GsiConfigInstallerOptions,
  type GsiConfigPreview
} from './GsiConfigInstaller'
