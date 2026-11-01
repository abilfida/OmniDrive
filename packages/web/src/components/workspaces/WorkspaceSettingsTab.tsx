import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { parseJsonObject } from '../../lib/utils';
import type { WorkspacePolicy } from '../../types';

export function WorkspaceSettingsTab({ workspaceId }: { workspaceId: string }) {
  const [policies, setPolicies] = useState<WorkspacePolicy[]>([]);
  const [quotaInput, setQuotaInput] = useState('');
  const [loading, setLoading] = useState(false);

  // We need the workspace object for usedBytes, but since we only have workspaceId here, 
  // we would ideally fetch the workspace details. For this MVP, we will just fetch policies.
  const loadPolicies = () => {
    api.getWorkspacePolicies(workspaceId).then((res) => {
      setPolicies(res.policies);
    }).catch(console.error);
  };

  useEffect(() => {
    loadPolicies();
  }, [workspaceId]);

  const handleSetQuota = async () => {
    if (!quotaInput) return;
    setLoading(true);
    try {
      await api.createWorkspacePolicy(workspaceId, {
        targetType: 'workspace',
        policyType: 'storage_quota',
        config: { max_bytes: parseInt(quotaInput, 10) * 1024 * 1024 * 1024 } // Input in GB
      });
      loadPolicies();
      setQuotaInput('');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePolicy = async (id: string) => {
    if (!confirm('Delete this policy?')) return;
    try {
      await api.deleteWorkspacePolicy(workspaceId, id);
      loadPolicies();
    } catch (e) {
      console.error(e);
    }
  };

  const quotaPolicy = policies.find(p => p.policyType === 'storage_quota');
  const maxBytes = quotaPolicy ? parseJsonObject(quotaPolicy.config).max_bytes ?? null : null;

  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col gap-8">
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">Storage & Quota</h2>
        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-2">
            Storage limits enforce a hard cap on the workspace size.
          </p>
          {maxBytes ? (
            <div className="bg-gray-100 rounded p-4 flex justify-between items-center">
              <span>Quota: <strong>{Math.round(maxBytes / (1024 * 1024 * 1024))} GB</strong></span>
              <button onClick={() => handleDeletePolicy(quotaPolicy!.id)} className="text-red-600 text-sm hover:underline">Remove Quota</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input 
                type="number" 
                placeholder="Limit in GB" 
                value={quotaInput} 
                onChange={(e) => setQuotaInput(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
              <button 
                onClick={handleSetQuota} 
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Set Quota
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Governance Policies</h2>
          <p className="text-sm text-gray-600 mt-1">Manage active retention and quota rules for this workspace.</p>
        </div>
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-sm text-gray-500">
            <tr>
              <th className="px-6 py-3 font-medium">Type</th>
              <th className="px-6 py-3 font-medium">Target</th>
              <th className="px-6 py-3 font-medium">Configuration</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {policies.map(p => {
              const config = parseJsonObject(p.config);
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{p.policyType.replace('_', ' ')}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{p.targetType} {p.targetId ? `(${p.targetId})` : ''}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono text-xs">
                    {p.policyType === 'storage_quota' ? `${Math.round(config.max_bytes / (1024*1024*1024))} GB limit` : `${config.action} (${config.days || 'indefinite'} days)`}
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    <button onClick={() => handleDeletePolicy(p.id)} className="text-red-600 hover:text-red-800 font-medium">Delete</button>
                  </td>
                </tr>
              );
            })}
            {policies.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500 text-sm">No governance policies active.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
