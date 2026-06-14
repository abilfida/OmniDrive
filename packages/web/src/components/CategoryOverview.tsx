import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatFileSize } from '../lib/utils';
import { api } from '../lib/api';
import { PieChart as PieChartIcon } from 'lucide-react';

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

export function CategoryOverview() {
  const [data, setData] = useState<CategoryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.getFileCategoryOverview().then((res) => {
      const categories: CategoryData[] = [
        { name: 'Images', value: res.images, color: '#3b82f6' },      // blue-500
        { name: 'Videos', value: res.videos, color: '#8b5cf6' },      // violet-500
        { name: 'Documents', value: res.documents, color: '#10b981' }, // emerald-500
        { name: 'Audio', value: res.audio, color: '#f59e0b' },        // amber-500
        { name: 'Archives', value: res.archives, color: '#6366f1' },  // indigo-500
        { name: 'Others', value: res.others, color: '#9ca3af' },      // gray-400
      ].filter(item => item.value > 0);
      
      // Sort by value descending
      categories.sort((a, b) => b.value - a.value);
      setData(categories);
    }).finally(() => {
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (data.length === 0) {
    return null;
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
          <p className="font-semibold text-gray-800">{payload[0].name}</p>
          <p className="text-gray-600">{formatFileSize(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <PieChartIcon size={18} className="text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Storage by Category</h2>
      </div>
      
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              formatter={(value) => (
                <span className="text-sm text-gray-600 font-medium ml-1">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
