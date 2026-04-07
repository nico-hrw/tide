import React, { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { notionists, openPeeps } from '@dicebear/collection';

interface AvatarProps {
  seed: string;
  style?: 'notionists' | 'openPeeps';
  size?: number;
  className?: string;
  verified?: boolean;
}

const PASTEL_COLORS = [
  'FFADAD', 'FFD6A5', 'FDFFB6', 'CAFFBF', '9BF6FF', 'A0C4FF', 'BDB2FF', 'FFC6FF', 
  'E2ECE9', 'DFE7FD', 'F1E4F3', 'FBF8CC', 'CCE3DE', 'D7E3FC'
];

export default function Avatar({ seed, style = 'notionists', size = 64, className = '', verified = false }: AvatarProps) {
  const avatarSvg = useMemo(() => {
    const collection = style === 'openPeeps' ? openPeeps : notionists;
    return createAvatar(collection, {
      seed: seed || 'default',
      backgroundColor: PASTEL_COLORS,
      radius: 50,
      scale: 90
    }).toString();
  }, [seed, style]);

  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <div 
        className="w-full h-full rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden border-2 border-white dark:border-gray-800"
        dangerouslySetInnerHTML={{ __html: avatarSvg }} 
      />
      {verified && (
        <div className="absolute -bottom-1 -right-1 bg-white dark:bg-black rounded-full p-[2px] shadow-sm">
          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </div>
  );
}
