import React from 'react';

export function getFileVisualCategory(fileName = '', mimeType = ''): string {
  const name = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/.test(name)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|webm|aac|flac)$/.test(name)) return 'audio';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (/\.(csv|xlsx?|numbers|ods)$/.test(name) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return 'sheet';
  }
  if (/\.(pptx?|key|odp)$/.test(name) || mime.includes('presentation') || mime.includes('powerpoint')) {
    return 'slides';
  }
  if (/\.(docx?|rtf|odt|txt|md)$/.test(name) || mime.includes('word') || mime.includes('document')) {
    return 'doc';
  }
  if (/\.(zip|rar|7z|tar|gz)$/.test(name) || mime.includes('zip') || mime.includes('archive')) {
    return 'archive';
  }
  if (/\.(json|js|ts|tsx|jsx|py|html|css|sql|yml|yaml|xml)$/.test(name)) return 'code';
  return 'file';
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}

export const FileTypeIcon: React.FC<{ fileName?: string; mimeType?: string; size?: number }> = ({
  fileName = '',
  mimeType = '',
  size = 18
}) => {
  const category = getFileVisualCategory(fileName, mimeType);
  const colorMap: Record<string, string> = {
    pdf: '#DC2626',
    sheet: '#15803D',
    slides: '#D97706',
    doc: '#2563EB',
    archive: '#7C3AED',
    code: '#0F766E',
    image: '#0284C7',
    video: '#9333EA',
    audio: '#DB2777',
    file: '#475569'
  };
  const stroke = colorMap[category] || colorMap.file;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      {category === 'sheet' && (
        <>
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
          <line x1="12" y1="11" x2="12" y2="19" />
        </>
      )}
      {category === 'code' && (
        <>
          <polyline points="10 13 8 15 10 17" />
          <polyline points="14 13 16 15 14 17" />
        </>
      )}
      {category !== 'sheet' && category !== 'code' && (
        <>
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </>
      )}
    </svg>
  );
};
