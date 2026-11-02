import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useDriveStore } from '../stores/driveStore';
import { useToastStore } from '../stores/toastStore';
import type { DriveFolder, FileEntry, BreadcrumbItem, WorkspaceFolder } from '../types';

export function useMergedDrive(folderId: string, driveIdParam: string | null) {
  const drives = useDriveStore(state => state.drives);
  const addToast = useToastStore(state => state.addToast);
  
  const [subfolders, setSubfolders] = useState<(DriveFolder | WorkspaceFolder)[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorDrives, setErrorDrives] = useState<Set<string>>(new Set());

  // Only the latest request may update state: a refresh or a slow response for a
  // folder the user already left would otherwise overwrite the current listing.
  const latestRequest = useRef(0);

  const fetchContents = useCallback(async () => {
    const requestId = ++latestRequest.current;
    const isStale = () => requestId !== latestRequest.current;

    if (drives.length === 0) {
      setSubfolders([]);
      setFiles([]);
      return;
    }

    setIsLoading(true);
    setSubfolders([]);
    setFiles([]);
    setBreadcrumb([]);
    setErrorDrives(new Set());

    try {
      if (folderId === 'root') {
        // Fetch all drives concurrently at root
        const promises = drives.map(drive => 
          api.getDriveFolderContents(drive.id, 'root')
            .catch(() => {
              if (isStale()) return { folder: null, subfolders: [], files: [], breadcrumb: [] };
              addToast('error', `Failed to load drive: ${drive.email}`);
              setErrorDrives(prev => new Set(prev).add(drive.id));
              return { folder: null, subfolders: [], files: [], breadcrumb: [] };
            })
        );
        
        const results = await Promise.all(promises);
        if (isStale()) return;
        
        const mergedFolders = results.flatMap(r => r.subfolders);
        const mergedFiles = results.flatMap(r => r.files);
        
        setSubfolders(mergedFolders);
        setFiles(mergedFiles);
        setBreadcrumb([{ id: 'root', name: 'All Files' }]);
      } else if (!driveIdParam) {
        addToast('error', 'Missing drive information for folder');
        setIsLoading(false);
        return;
      } else {
        // Fetch specific sub-folder for a specific drive
        const data = await api.getDriveFolderContents(driveIdParam, folderId);
        if (isStale()) return;
        setSubfolders(data.subfolders);
        setFiles(data.files);
        setBreadcrumb(data.breadcrumb || [{ id: 'root', name: 'All Files' }]);
      }
    } catch (err) {
      if (isStale()) return;
      addToast('error', 'Failed to load folder contents');
    } finally {
      if (!isStale()) {
        setIsLoading(false);
      }
    }
  }, [folderId, driveIdParam, drives, addToast]);

  useEffect(() => {
    fetchContents();
    return () => {
      latestRequest.current++; // whatever is in flight is now stale
    };
  }, [fetchContents]);

  return { subfolders, files, breadcrumb, isLoading, errorDrives, refresh: fetchContents };
}
