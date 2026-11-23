import React, { useState } from 'react';
import { getAvatarSource, getUserInitials } from '../../context/DashboardContext';
import type { ProjectMember } from '../../types/taskViewer';
import styles from './PersonAvatar.module.css';

export interface PersonAvatarProps {
  person: Partial<ProjectMember> & { name?: string; initials?: string; tone?: string };
  className?: string;
  size?: number;
}

export const PersonAvatar: React.FC<PersonAvatarProps> = ({ person, className, size }) => {
  const [failedImgSrc, setFailedImgSrc] = useState('');
  const name = person.name || 'Project member';
  const initials = person.initials || getUserInitials(name);
  const tone = person.tone || 'indigo';
  const imgSrc = getAvatarSource(person);
  const rootClass = `avatar ${styles['person-avatar']} ${tone}-bg${className ? ` ${className}` : ''}`;
  const rootStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-grid',
    placeItems: 'center',
    overflow: 'hidden',
    borderRadius: '50%',
    flexShrink: 0,
    ...(size
      ? {
          width: size,
          height: size,
          minWidth: size,
          minHeight: size
        }
      : {})
  };
  const imageStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
    borderRadius: 'inherit'
  };

  if (imgSrc && failedImgSrc !== imgSrc) {
    return (
      <span className={`${rootClass} has-photo`} title={name} style={rootStyle}>
        <img
          src={imgSrc}
          alt={name}
          width={size}
          height={size}
          className={styles['person-avatar-img']}
          style={imageStyle}
          referrerPolicy="no-referrer"
          onError={() => setFailedImgSrc(imgSrc)}
        />
      </span>
    );
  }

  return (
    <span className={rootClass} title={name} style={rootStyle}>
      {initials}
    </span>
  );
};
