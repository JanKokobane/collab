import React, { useEffect, useId, useRef, useState } from 'react';
import type { MediaAttachment } from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import { FileTypeIcon } from '../../utils/fileIcons';
import styles from './TaskMediaEditor.module.css';

const cx = createCx(styles);

const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MAX_SCREEN_SECONDS = 90;

const mimeByExtension: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed'
};

function resolveAttachmentMimeType(fileName: string, providedMimeType?: string): string {
  const mime = String(providedMimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (mime && mime !== 'application/octet-stream') {
    return mime;
  }
  const extMatch = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return (extMatch && mimeByExtension[extMatch[1]]) || 'application/octet-stream';
}

function getAttachmentDataSource(attachment: MediaAttachment): string {
  return String(
    attachment.data || attachment.dataUrl || attachment.data_url || attachment.url || ''
  );
}

function getAttachmentMimeType(attachment: MediaAttachment): string {
  return String(
    attachment.mediaType || attachment.mimeType || attachment.mime_type || attachment.type || ''
  );
}

function getAttachmentFileName(attachment: MediaAttachment): string {
  return String(attachment.fileName || attachment.name || 'Attachment');
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(blob);
  });
}

function formatTimer(seconds: number): string {
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export interface TaskMediaEditorProps {
  attachments: MediaAttachment[];
  onChange: (next: MediaAttachment[]) => void;
  label?: string;
  allowScreenRecording?: boolean;
  maxAttachments?: number;
  accept?: string;
}

export const TaskMediaEditor: React.FC<TaskMediaEditorProps> = ({
  attachments,
  onChange,
  label = 'Media',
  allowScreenRecording = true,
  maxAttachments = Infinity,
  accept = ''
}) => {
  const fileInputId = useId();
  const [statusMessage, setStatusMessage] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'audio' | 'video' | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const timerIdRef = useRef<number | null>(null);
  const attachmentsRef = useRef<MediaAttachment[]>(attachments);
  attachmentsRef.current = attachments;

  const stopTracks = () => {
    streamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    streamsRef.current = [];
  };

  const clearTimer = () => {
    if (timerIdRef.current !== null) {
      window.clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
      stopTracks();
    };
  }, []);

  const showStatus = (message: string, isError = false) => {
    setStatusMessage(message);
    setStatusIsError(isError);
  };

  const validateAndAddAttachments = async (nextItems: MediaAttachment[]) => {
    const existing = attachmentsRef.current;
    if (existing.length + nextItems.length > maxAttachments) {
      showStatus(
        `You can attach up to ${maxAttachments} file${maxAttachments === 1 ? '' : 's'}.`,
        true
      );
      return false;
    }
    const existingTotal = existing.reduce((sum, item) => sum + Number(item.size || 0), 0);
    const addedTotal = nextItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
    if (existingTotal + addedTotal > MAX_ATTACHMENT_BYTES) {
      showStatus('Keep attachments under 100 MB total.', true);
      return false;
    }
    onChange([...existing, ...nextItems]);
    return true;
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    showStatus('Reading selected files...');
    try {
      const prepared: MediaAttachment[] = [];
      for (const file of files) {
        const mimeType = resolveAttachmentMimeType(file.name, file.type);
        const data = await readBlobAsDataUrl(file);
        prepared.push({
          id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name || 'Attachment',
          name: file.name || 'Attachment',
          mediaType: mimeType,
          mimeType,
          size: file.size || 0,
          data,
          dataUrl: data
        });
      }
      const added = await validateAndAddAttachments(prepared);
      if (added) {
        showStatus('');
      }
    } catch (error: any) {
      showStatus(error?.message || 'Could not process the selected file.', true);
    }
  };

  const stopRecording = () => {
    clearTimer();
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  const startRecording = async (kind: 'audio' | 'video') => {
    if (recordingMode) {
      stopRecording();
      return;
    }
    if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
      showStatus('Recording is not supported in this browser.', true);
      return;
    }

    try {
      showStatus('');
      const streams: MediaStream[] = [];
      let stream: MediaStream;

      if (kind === 'audio') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streams.push(stream);
      } else {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        streams.push(displayStream);
        let combinedTracks = [...displayStream.getTracks()];
        if (displayStream.getAudioTracks().length === 0) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streams.push(micStream);
            combinedTracks = [...combinedTracks, ...micStream.getAudioTracks()];
          } catch {
            // Mic optional for screen capture
          }
        }
        stream = new MediaStream(combinedTracks);
      }

      streamsRef.current = streams;
      const mimeTypes =
        kind === 'audio'
          ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
          : ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm'];
      const chosenMimeType =
        mimeTypes.find((type) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)) ||
        '';
      const chunks: Blob[] = [];
      const recorder = chosenMimeType
        ? new MediaRecorder(stream, {
            mimeType: chosenMimeType,
            ...(kind === 'audio' ? { audioBitsPerSecond: 48000 } : { videoBitsPerSecond: 900000 })
          })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      const startTime = Date.now();
      setRecordingMode(kind);
      setElapsedSeconds(0);

      timerIdRef.current = window.setInterval(() => {
        const secs = Math.round((Date.now() - startTime) / 1000);
        setElapsedSeconds(secs);
        if (kind === 'video' && secs >= MAX_SCREEN_SECONDS) {
          stopRecording();
        }
      }, 1000);

      streams[0].getTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (recorder.state === 'recording') {
            stopRecording();
          }
        });
      });

      recorder.addEventListener('dataavailable', (evt) => {
        if (evt.data && evt.data.size > 0) chunks.push(evt.data);
      });

      recorder.addEventListener('stop', async () => {
        clearTimer();
        stopTracks();
        setRecordingMode(null);
        const durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        const rawType = chosenMimeType || chunks[0]?.type || (kind === 'audio' ? 'audio/webm' : 'video/webm');
        const cleanType = rawType.split(';')[0];
        const blob = new Blob(chunks, { type: cleanType });
        if (!blob.size) {
          showStatus('No recording data captured.', true);
          return;
        }
        const ext = cleanType.includes('ogg') ? 'ogg' : cleanType.includes('mp4') ? 'm4a' : 'webm';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `${kind === 'audio' ? 'voice-note' : 'screen-recording'}-${stamp}.${ext}`;
        const data = await readBlobAsDataUrl(blob);
        const added = await validateAndAddAttachments([
          {
            id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            fileName,
            name: fileName,
            mediaType: cleanType,
            mimeType: cleanType,
            size: blob.size,
            data,
            dataUrl: data,
            is_voice_note: kind === 'audio',
            duration_seconds: durationSeconds
          }
        ]);
        if (added) {
          showStatus(
            kind === 'audio'
              ? `Attached voice note (${formatTimer(durationSeconds)}).`
              : `Attached screen recording (${formatTimer(durationSeconds)}).`
          );
        }
      });

      recorder.start(1000);
    } catch {
      clearTimer();
      stopTracks();
      setRecordingMode(null);
      showStatus(
        kind === 'audio'
          ? 'Microphone recording was cancelled or unavailable.'
          : 'Screen recording was cancelled or unavailable.',
        true
      );
    }
  };

  return (
    <div className={cx('task-media-editor')}>
      <div className={cx('task-media-heading')}>
        <strong>{label}</strong>
        <small>Attach files (up to 100 MB), record audio, or capture screen.</small>
      </div>

      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        className={cx('task-media-file-input')}
        multiple
        accept={accept || undefined}
        onChange={handleFilesSelected}
      />

      <div className={cx('task-media-picker')}>
        <button
          type="button"
          className={cx('task-media-action')}
          disabled={Boolean(recordingMode)}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className={cx('task-media-action-icon')} aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <title>attach-file-add</title>
              <path
                fill="currentColor"
                d="M16 11V6h2v5zm-5 6.9q-.875-.25-1.437-.975T9 15.25V6h2zm.75 4.1q-2.6 0-4.425-1.825T5.5 15.75V6.5q0-1.875 1.313-3.187T10 2t3.188 1.313T14.5 6.5V14h-2V6.5q-.025-1.05-.737-1.775T10 4t-1.775.725T7.5 6.5v9.25q-.025 1.775 1.225 3.013T11.75 20q.625 0 1.188-.162T14 19.35v2.225q-.525.2-1.088.313T11.75 22M16 21v-3h-3v-2h3v-3h2v3h3v2h-3v3z"
              />
            </svg>
          </span>
          <span>Attach files</span>
        </button>

        <button
          type="button"
          className={cx('task-media-action')}
          disabled={recordingMode === 'video'}
          onClick={() => startRecording('audio')}
        >
          <span className={cx('task-media-action-icon')} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </span>
          <span>
            {recordingMode === 'audio' ? `Stop audio (${formatTimer(elapsedSeconds)})` : 'Record audio'}
          </span>
        </button>

        {allowScreenRecording && (
          <button
            type="button"
            className={cx('task-media-action')}
            disabled={recordingMode === 'audio'}
            onClick={() => startRecording('video')}
          >
            <span className={cx('task-media-action-icon')} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </span>
            <span>
              {recordingMode === 'video' ? `Stop screen (${formatTimer(elapsedSeconds)})` : 'Record screen'}
            </span>
          </button>
        )}
      </div>

      {statusMessage && (
        <div
          className={cx('task-media-status', { 'is-error': statusIsError })}
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </div>
      )}

      {attachments.length > 0 && (
        <div className={cx('task-media-attachment-list')}>
          {attachments.map((att, idx) => {
            const name = getAttachmentFileName(att);
            const mime = getAttachmentMimeType(att);
            const kb = Math.max(1, Math.round(Number(att.size || 0) / 1024));
            return (
              <div
                key={att.id || `${name}-${idx}`}
                className={cx('task-media-attachment')}
              >
                <span className={cx('task-media-attachment-icon')}>
                  <FileTypeIcon fileName={name} mimeType={mime} size={20} />
                </span>
                <span className={cx('task-media-attachment-name')}>{name}</span>
                <span>{kb} KB</span>
                <button
                  type="button"
                  className={cx('task-media-remove')}
                  onClick={() => onChange(attachments.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      <TaskMediaPlayers attachments={attachments} />
    </div>
  );
};

export const TaskMediaPlayers: React.FC<{ attachments?: MediaAttachment[] }> = ({
  attachments = []
}) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className={cx('task-media-player-list')}>
      {attachments.map((att, idx) => {
        const src = getAttachmentDataSource(att);
        const mime = getAttachmentMimeType(att).toLowerCase();
        const name = getAttachmentFileName(att);
        const key = att.id || `${name}-${idx}`;

        if (!src) return null;

        if (mime.startsWith('video/')) {
          return (
            <div key={key} className={cx('task-media-item')}>
              <video className={cx('task-media-player')} src={src} controls preload="metadata" />
            </div>
          );
        }

        if (mime.startsWith('audio/')) {
          return (
            <div key={key} className={cx('task-media-item')}>
              <audio className={cx('task-media-player')} src={src} controls preload="metadata" />
            </div>
          );
        }

        if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
          return (
            <div key={key} className={cx('task-media-item')}>
              <img className={cx('task-media-image')} src={src} alt={name} loading="lazy" />
            </div>
          );
        }

        return (
          <div key={key} className={cx('task-media-attachment')}>
            <span className={cx('task-media-attachment-icon')}>
              <FileTypeIcon fileName={name} mimeType={mime} size={20} />
            </span>
            <a
              href={src}
              download={name}
              className={cx('task-media-attachment-name')}
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              {name}
            </a>
          </div>
        );
      })}
    </div>
  );
};
