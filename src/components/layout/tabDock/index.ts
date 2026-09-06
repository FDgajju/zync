export { TabDockOverlay } from './TabDockOverlay';
export { useDockTabPointer, type DockTabPointerHandlers } from './useDockTabPointer';
export { getTabDockLive, startTabDock, stopTabDock } from './session';
export { splitOpenMenuItems, splitOpenSubmenu, openHerePlacementItems } from './splitOpenItems';
export {
    openFilesHere,
    openTerminalHere,
    canDockHere,
    canSplitBesideFiles,
    filesAlreadyInSplit,
    directoryFromFileLocation,
    parentDirectory,
    pickFilesOpenPath,
    type OpenHereFile,
} from './openHere';
