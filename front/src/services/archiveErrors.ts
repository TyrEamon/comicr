const CORRUPT_ARCHIVE_RE = /(invalid entry size|zip end|end header|unexpected end|truncated|corrupt|crc|checksum|invalid stored block|invalid distance|data error)/i

export function archiveErrorMessage(error: unknown, action = '读取压缩包') {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (CORRUPT_ARCHIVE_RE.test(message)) {
    return `${action}失败：压缩包可能没有下载完整或已经损坏，请重新下载后再导入。`
  }
  return message || `${action}失败`
}

export function normalizeArchiveError(error: unknown, action = '读取压缩包') {
  return new Error(archiveErrorMessage(error, action))
}
