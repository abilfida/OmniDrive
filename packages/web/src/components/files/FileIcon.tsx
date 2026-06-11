
import { 
  Image as ImageIcon, 
  Film, 
  Music, 
  FileText, 
  FileSpreadsheet, 
  Presentation, 
  Archive, 
  File as FileGeneric
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface FileIconProps {
  mimeType: string | null;
  className?: string;
}

export function FileIcon({ mimeType, className }: FileIconProps) {
  const getIconInfo = () => {
    if (!mimeType) return { Icon: FileGeneric, color: 'text-gray-500' };
    if (mimeType.startsWith('image/')) return { Icon: ImageIcon, color: 'text-purple-500' };
    if (mimeType.startsWith('video/')) return { Icon: Film, color: 'text-pink-500' };
    if (mimeType.startsWith('audio/')) return { Icon: Music, color: 'text-yellow-500' };
    if (mimeType.includes('pdf')) return { Icon: FileText, color: 'text-red-500' };
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return { Icon: FileSpreadsheet, color: 'text-green-600' };
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return { Icon: Presentation, color: 'text-orange-500' };
    if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('text')) return { Icon: FileText, color: 'text-blue-500' };
    if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) return { Icon: Archive, color: 'text-amber-600' };
    
    return { Icon: FileGeneric, color: 'text-gray-500' };
  };

  const { Icon, color } = getIconInfo();

  return <Icon size="1em" className={cn(color, className, 'flex-shrink-0')} />;
}
