import React, { useState } from 'react';
import { getAvatarSource, getUserInitials } from '../../context/DashboardContext';
import type { ProjectMember } from '../../types/dashboard';

export interface PersonAvatarProps {
  person: Partial<ProjectMember> & { name?: string; initials?: string; tone?: string };
  className?: string;
}

export const PersonAvatar: React.FC<PersonAvatarProps> = ({ person, className }) => {
  const [failedImgSrc, setFailedImgSrc] = useState('');
  const name = person.name || 'Project member';
  const initials = person.initials || getUserInitials(name);
  const tone = person.tone || 'teal';
  const imgSrc = getAvatarSource(person);

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
