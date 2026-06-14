import React, { useEffect, useState } from 'react';
import { useDriveStore } from '../../stores/driveStore';
import { formatFileSize } from '../../lib/utils';
import { api } from '../../lib/api';

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
        const allCategories = [
          { name: 'Images', value: res.images, color: '#ef4444' },      // red
          { name: 'Videos', value: res.videos, color: '#f59e0b' },      // yellow
          { name: 'Documents', value: res.documents, color: '#3b82f6' }, // blue
          { name: 'Audio', value: res.audio, color: '#10b981' },        // green
          { name: 'Archives', value: res.archives, color: '#6366f1' },  // indigo
        ];
        
        let sorted = allCategories.filter(c => c.value > 0).sort((a, b) => b.value - a.value);
        
        let displayCategories: CategoryData[] = [];
        let othersValue = res.others || 0;

        if (sorted.length > 3) {
          displayCategories = sorted.slice(0, 3);
          othersValue += sorted.slice(3).reduce((sum, item) => sum + item.value, 0);
        } else {
          displayCategories = sorted;
        }

        if (othersValue > 0) {
          displayCategories.push({ name: 'Others', value: othersValue, color: '#9ca3af' }); // gray
        }
        
        setData(displayCategories);
      }).catch(console.error);
    }
  }, [aggregate.totalQuota]);

  if (aggregate.totalQuota === 0) return null;

  const totalPct = Math.min((aggregate.totalUsed / aggregate.totalQuota) * 100, 100);

  return (
    <div className="px-4 py-3 mt-1 border-t border-gray-200 dark:border-gray-800">
      {/* Stacked Category Bar */}
      <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-3 flex">
        {data.map((item, idx) => {
          const pct = aggregate.totalUsed > 0 ? (item.value / aggregate.totalUsed) * 100 : 0;
          return pct > 0 ? (
            <div
              key={idx}
              className="h-full transition-all opacity-80 hover:opacity-100"
              style={{ width: `${pct}%`, backgroundColor: item.color }}
              title={`${item.name}: ${formatFileSize(item.value)}`}
            />
          ) : null;
        })}
      </div>

      {/* Category List */}
      <div className="space-y-2 mb-4">
        {data.map((item, idx) => {
          const pct = aggregate.totalUsed > 0 ? (item.value / aggregate.totalUsed) * 100 : 0;
          return (
            <div key={idx} className="flex justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
              </div>
              <span className="text-gray-500 text-[10px]">
                {formatFileSize(item.value)} ({pct.toFixed(1)}%)
              </span>
            </div>
          );
        })}
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="font-medium text-gray-700 dark:text-gray-300">Storage</span>
          <span className="text-gray-500">
            {totalPct.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${totalPct}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-500">
          {formatFileSize(aggregate.totalUsed)} of {formatFileSize(aggregate.totalQuota)} used
        </p>
      </div>
    </div>
  );
};
