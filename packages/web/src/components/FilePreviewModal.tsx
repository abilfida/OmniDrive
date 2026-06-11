import { X, ExternalLink, Download } from 'lucide-react';
import type { FileEntry } from '../types';
import { formatFileSize, formatRelativeTime } from '../lib/utils';
import { FileIcon } from './files/FileIcon';

interface FilePreviewModalProps {
  file: FileEntry;
  onClose: () => void;
}

import { useState } from 'react';

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const isImage = file.mimeType?.startsWith('image/');
  const isGoogleDoc = file.mimeType?.startsWith('application/vnd.google-apps.');
  const [imageError, setImageError] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-full" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <span className="text-4xl shrink-0"><FileIcon mimeType={file.mimeType} /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-800 truncate" title={file.name}>
                {file.name}
              </h2>
              <div className="text-xs text-gray-500 truncate">
                {file.driveEmail || 'Google Drive'}
              </div>
            </div>
          </div>
          <button 
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors shrink-0" 
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body - Scrollable */}
        <div className="p-6 overflow-y-auto">
          {/* Preview */}
          {isImage && file.thumbnailUrl && (
            <div className="mb-6 rounded-xl overflow-hidden bg-gray-50 border border-gray-200 flex justify-center items-center p-2 min-h-[200px]">
              {!imageError ? (
                <img
                  src={typeof file.thumbnailUrl === 'string' ? file.thumbnailUrl.replace('=s220', '=s600') : file.thumbnailUrl}
                  alt={file.name}
                  loading="lazy"
                  className="max-w-full max-h-[400px] object-contain rounded-lg shadow-sm"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-400">
                  <FileIcon mimeType={file.mimeType} className="w-16 h-16 mb-2" />
                  <span className="text-sm">Preview unavailable</span>
                </div>
              )}
            </div>
          )}

          {!isImage && file.thumbnailUrl && (
            <div className="mb-6 flex justify-center p-8 bg-gray-50 border border-gray-200 rounded-xl min-h-[200px]">
              {!imageError ? (
                <img 
                  src={file.thumbnailUrl} 
                  alt={file.name} 
                  loading="lazy"
                  className="max-h-[200px] object-contain shadow-sm rounded bg-white" 
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-400">
                  <FileIcon mimeType={file.mimeType} className="w-16 h-16 mb-2" />
                  <span className="text-sm">Preview unavailable</span>
                </div>
              )}
            </div>
          )}

          {/* File Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm bg-gray-50 p-4 rounded-xl border border-gray-100">
            <div>
              <div className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Size</div>
              <div className="text-gray-800 font-medium">{formatFileSize(file.size)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Type</div>
              <div className="text-gray-800 font-medium truncate" title={file.mimeType ?? 'Unknown'}>
                {file.mimeType ?? 'Unknown'}
              </div>
            </div>
            <div>
              <div className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Modified</div>
              <div className="text-gray-800 font-medium truncate">
                {file.googleModifiedAt ? formatRelativeTime(file.googleModifiedAt) : '—'}
              </div>
            </div>
            <div>
              <div className="text-gray-500 text-xs uppercase tracking-wide font-medium mb-1">Created</div>
              <div className="text-gray-800 font-medium truncate">
                {file.googleCreatedAt ? formatRelativeTime(file.googleCreatedAt) : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-gray-100 bg-gray-50 flex gap-3 justify-end shrink-0">
          {file.webViewLink && (
            <a 
              href={file.webViewLink} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors shadow-sm"
              style={{ textDecoration: 'none' }}
            >
              <ExternalLink size={18} /> Open in Drive
            </a>
          )}
          {file.webContentLink && !isGoogleDoc && (
            <a 
              href={file.webContentLink} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
              style={{ textDecoration: 'none' }}
            >
              <Download size={18} /> Download
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
