import React, { useState } from 'react';
import type { ProjectMember } from '../../types/taskViewer';

export interface PersonAvatarProps {
  person: Partial<ProjectMember> & { name?: string; initials?: string; tone?: string };
  className?: string;
}

export function getUserInitials(name?: string): string {
  if (!name) return 'PM';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export const PersonAvatar: React.FC<PersonAvatarProps> = ({ person, className }) => {
  const [failedImgSrc, setFailedImgSrc] = useState('');
  const name = person.name || 'Project member';
  const initials = person.initials || getUserInitials(name);
  const tone = person.tone || 'indigo';
  const imgSrc = person.profileImage || '';

  if (imgSrc && failedImgSrc !== imgSrc) {
    return (
      <span
        className={`avatar ${tone}-bg has-photo${className ? ` ${className}` : ''}`}
        title={name}
      >
        <img
          src={imgSrc}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setFailedImgSrc(imgSrc)}
        />
      </span>
    );
  }

  return (
    <span className={`avatar ${tone}-bg${className ? ` ${className}` : ''}`} title={name}>
      {initials}
    </span>
  );
};
