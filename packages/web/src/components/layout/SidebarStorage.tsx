import React, { useEffect, useState } from 'react';
import { useDriveStore } from '../../stores/driveStore';
import { formatFileSize } from '../../lib/utils';
import { api } from '../../lib/api';
import { NavLink } from 'react-router-dom';

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

export const SidebarStorage: React.FC = () => {
  const { aggregate } = useDriveStore();
  const [data, setData] = useState<CategoryData[]>([]);

  useEffect(() => {
    if (aggregate.totalQuota > 0) {
      api.getFileCategoryOverview().then((res) => {
        const categories: CategoryData[] = [
          { name: 'Images', value: res.images, color: '#ef4444' },      // red
          { name: 'Videos', value: res.videos, color: '#f59e0b' },      // yellow
          { name: 'Documents', value: res.documents, color: '#3b82f6' }, // blue
          { name: 'Audio', value: res.audio, color: '#10b981' },        // green
          { name: 'Archives', value: res.archives, color: '#6366f1' },  // indigo
          { name: 'Others', value: res.others, color: '#9ca3af' },      // gray
        ].filter(item => item.value > 0);
        setData(categories);
      }).catch(console.error);
    }
  }, [aggregate.totalQuota]);

  if (aggregate.totalQuota === 0) return null;

  return (
    <div className="px-4 py-3 mt-1">
      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden mb-2 flex">
        {data.length > 0 ? (
          data.map((item, idx) => {
            const widthPct = Math.max((item.value / aggregate.totalQuota) * 100, 0.1); // min 0.1% for visibility if size > 0
            return (
              <div
                key={idx}
                title={`${item.name}: ${formatFileSize(item.value)}`}
                className="h-full transition-all hover:opacity-80"
                style={{ width: `${widthPct}%`, backgroundColor: item.color }}
              />
            );
          })
        ) : (
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${Math.min((aggregate.totalUsed / aggregate.totalQuota) * 100, 100)}%` }}
          />
        )}
      </div>
      <p className="text-xs text-gray-500">
        {formatFileSize(aggregate.totalUsed)} of {formatFileSize(aggregate.totalQuota)} used
      </p>
      <NavLink
        to="/settings/drives"
        className="text-xs text-blue-600 hover:underline mt-1 inline-block"
      >
        Manage storage
      </NavLink>
    </div>
  );
};
