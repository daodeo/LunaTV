/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Download } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface OfflineDownloadConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const OfflineDownloadConfig: React.FC<OfflineDownloadConfigProps> = ({
  config,
  refreshConfig,
}) => {
  const [settings, setSettings] = useState({
    enabled: false,
    downloadDir: './data/downloads',
    enableClientDownload: true,
    enableServerDownload: false,
    maxConcurrentDownloads: 3,
    segmentConcurrency: 6,
    maxRetries: 3,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (config?.OfflineDownloadConfig) {
      setSettings({
        enabled: config.OfflineDownloadConfig.enabled ?? false,
        downloadDir: config.OfflineDownloadConfig.downloadDir || './data/downloads',
        enableClientDownload: config.OfflineDownloadConfig.enableClientDownload ?? true,
        enableServerDownload: config.OfflineDownloadConfig.enableServerDownload ?? false,
        maxConcurrentDownloads: config.OfflineDownloadConfig.maxConcurrentDownloads || 3,
        segmentConcurrency: config.OfflineDownloadConfig.segmentConcurrency || 6,
        maxRetries: config.OfflineDownloadConfig.maxRetries || 3,
      });
    }
  }, [config]);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/offline-download-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      setMessage({ type: 'success', text: '离线下载配置保存成功！' });
      await refreshConfig();

      // 3秒后自动隐藏成功消息
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '保存失败',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='space-y-6'>
      {/* 消息提示 */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 功能总开关 */}
      <div className='flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
        <div className='flex items-center gap-3'>
          <Download className='text-blue-600 dark:text-blue-400' size={24} />
          <div>
            <h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
              离线下载功能
            </h3>
            <p className='text-sm text-gray-600 dark:text-gray-400'>
              启用后可以下载M3U8视频到本地
            </p>
          </div>
        </div>
        <button
          onClick={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.enabled
              ? 'bg-green-600 dark:bg-green-600'
              : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {settings.enabled && (
        <>
          {/* 下载模式选择 */}
          <div className='space-y-4'>
            <h4 className='text-md font-semibold text-gray-900 dark:text-white'>
              下载模式
            </h4>

            {/* 客户端下载 */}
            <div className='flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg'>
              <div>
                <h5 className='font-medium text-gray-900 dark:text-white'>
                  客户端M3U8下载
                </h5>
                <p className='text-sm text-gray-600 dark:text-gray-400'>
                  在浏览器中直接下载视频文件（无需服务器存储空间）
                </p>
              </div>
              <button
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    enableClientDownload: !prev.enableClientDownload,
                  }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enableClientDownload
                    ? 'bg-green-600 dark:bg-green-600'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enableClientDownload ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* 服务器端下载 */}
            <div className='flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg'>
              <div>
                <h5 className='font-medium text-gray-900 dark:text-white'>
                  服务器端离线下载
                </h5>
                <p className='text-sm text-gray-600 dark:text-gray-400'>
                  在服务器后台下载，支持断点续传（需要管理员权限）
                </p>
              </div>
              <button
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    enableServerDownload: !prev.enableServerDownload,
                  }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enableServerDownload
                    ? 'bg-green-600 dark:bg-green-600'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enableServerDownload ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 服务器端下载设置 */}
          {settings.enableServerDownload && (
            <div className='space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg'>
              <h4 className='text-md font-semibold text-gray-900 dark:text-white'>
                服务器端下载设置
              </h4>

              {/* 下载目录 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  下载目录路径
                </label>
                <input
                  type='text'
                  value={settings.downloadDir}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, downloadDir: e.target.value }))
                  }
                  className='w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
                  placeholder='./data/downloads'
                />
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  服务器上存储下载文件的目录路径
                </p>
              </div>

              {/* 最大并发下载任务数 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  最大并发下载任务数: {settings.maxConcurrentDownloads}
                </label>
                <input
                  type='range'
                  min='1'
                  max='10'
                  value={settings.maxConcurrentDownloads}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      maxConcurrentDownloads: parseInt(e.target.value),
                    }))
                  }
                  className='w-full'
                />
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  同时进行的下载任务数量（1-10）
                </p>
              </div>

              {/* 片段下载并发数 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  片段下载并发数: {settings.segmentConcurrency}
                </label>
                <input
                  type='range'
                  min='1'
                  max='12'
                  value={settings.segmentConcurrency}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      segmentConcurrency: parseInt(e.target.value),
                    }))
                  }
                  className='w-full'
                />
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  每个任务内并发下载的片段数（1-12）
                </p>
              </div>

              {/* 最大重试次数 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  失败重试次数: {settings.maxRetries}
                </label>
                <input
                  type='range'
                  min='1'
                  max='10'
                  value={settings.maxRetries}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      maxRetries: parseInt(e.target.value),
                    }))
                  }
                  className='w-full'
                />
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  片段下载失败时的重试次数（1-10）
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* 保存按钮 */}
      <div className='flex justify-end'>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            isSaving
              ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed text-white'
              : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white'
          }`}
        >
          {isSaving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
};

export default OfflineDownloadConfig;
