import { useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api';
import { useDriveStore } from '../stores/driveStore';
import { useToastStore } from '../stores/toastStore';
import type { DriveFolder, FileEntry, BreadcrumbItem } from '../types';

export function useMergedDrive(folderId: string, driveIdParam: string | null) {
  const drives = useDriveStore(state => state.drives);
  const addToast = useToastStore(state => state.addToast);
  
  const [subfolders, setSubfolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorDrives, setErrorDrives] = useState<Set<string>>(new Set());

  const fetchContents = useCallback(async (abortSignal?: AbortSignal) => {
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
              addToast('error', `Failed to load drive: ${drive.email}`);
              setErrorDrives(prev => new Set(prev).add(drive.id));
              return { folder: null, subfolders: [], files: [], breadcrumb: [] };
            })
        );
        
        const results = await Promise.all(promises);
        if (abortSignal?.aborted) return;
        
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
        const data = await api.getFolderContents(folderId, undefined, undefined, driveIdParam);
        if (abortSignal?.aborted) return;
        setSubfolders(data.subfolders);
        setFiles(data.files);
        setBreadcrumb(data.breadcrumb || [{ id: 'root', name: 'All Files' }]);
      }
    } catch (err) {
      if (abortSignal?.aborted) return;
      addToast('error', 'Failed to load folder contents');
    } finally {
      if (!abortSignal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [folderId, driveIdParam, drives, addToast]);

  useEffect(() => {
    const controller = new AbortController();
    fetchContents(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchContents]);

  return { subfolders, files, breadcrumb, isLoading, errorDrives, refresh: () => fetchContents() };
}
