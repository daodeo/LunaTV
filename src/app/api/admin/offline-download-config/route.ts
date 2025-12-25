/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { ensureAdmin } from '@/lib/admin-auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // 权限检查
  try {
    await ensureAdmin(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '无权限' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const {
      enabled,
      downloadDir,
      enableClientDownload,
      enableServerDownload,
      maxConcurrentDownloads,
      segmentConcurrency,
      maxRetries,
    } = body;

    // 获取当前配置
    const config = await getConfig();

    // 更新离线下载配置
    config.OfflineDownloadConfig = {
      enabled: enabled ?? false,
      downloadDir: downloadDir || './data/downloads',
      enableClientDownload: enableClientDownload ?? true,
      enableServerDownload: enableServerDownload ?? false,
      maxConcurrentDownloads: maxConcurrentDownloads || 3,
      segmentConcurrency: segmentConcurrency || 6,
      maxRetries: maxRetries || 3,
    };

    // 保存到数据库
    await db.saveAdminConfig(config);

    // 清除配置缓存
    clearConfigCache();

    console.log('离线下载配置已更新:', config.OfflineDownloadConfig);

    return NextResponse.json({
      success: true,
      message: '离线下载配置保存成功',
      config: config.OfflineDownloadConfig,
    });
  } catch (error) {
    console.error('保存离线下载配置失败:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '保存失败',
      },
      { status: 500 }
    );
  }
}
