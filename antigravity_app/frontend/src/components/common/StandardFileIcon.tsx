import React, { useState } from 'react';

interface StandardFileIconProps {
  filename?: string;
  isFolder?: boolean;
  isOpen?: boolean;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const FOLDER_MAP: Record<string, string> = {
  layout: 'folder-layout.svg',
  layouts: 'folder-layout.svg',
  services: 'folder-services.svg',
  service: 'folder-services.svg',
  components: 'folder-src.svg',
  component: 'folder-src.svg',
  common: 'folder-green.svg',
  editor: 'folder-orange.svg',
  filetree: 'folder-green.svg',
  terminal: 'folder-green.svg',
  types: 'folder-sky.svg',
  type: 'folder-sky.svg',
  modes: 'folder.svg',
  mode: 'folder.svg',
  api: 'folder-services.svg',
  apis: 'folder-services.svg',
  deepapi: 'folder-purple.svg',
  app: 'folder-app.svg',
  src: 'folder-src.svg',
  routes: 'folder-router.svg',
  router: 'folder-router.svg',
  hooks: 'folder-hooks.svg',
  models: 'folder-models.svg',
  model: 'folder-models.svg',
  utils: 'folder-utils.svg',
  util: 'folder-utils.svg',
  helpers: 'folder-helpers.svg',
  helper: 'folder-helpers.svg',
  assets: 'folder-assets.svg',
  images: 'folder-images.svg',
  icons: 'folder-images.svg',
  config: 'folder-config.svg',
  configs: 'folder-config.svg',
  db: 'folder-database.svg',
  database: 'folder-database.svg',
  storage: 'folder-database.svg',
  sqlite: 'folder-database.svg',
  internal: 'folder-core.svg',
  core: 'folder-core.svg',
  tools: 'folder-orange-code.svg',
  wailsjs: 'folder-sky-code.svg',
};

const FILE_MAP: Record<string, string> = {
  'package.json': 'npm.svg',
  'package-lock.json': 'npm.svg',
  'tsconfig.json': 'tsconfig.svg',
  'tsconfig.node.json': 'tsconfig.svg',
  'vite.config.ts': 'vite.svg',
  'vite.config.js': 'vite.svg',
  'tailwind.config.js': 'tailwind.svg',
  'tailwind.config.ts': 'tailwind.svg',
  'postcss.config.js': 'postcss.svg',
  'index.html': 'code-orange.svg',
  'dockerfile': 'docker.svg',
  'docker-compose.yml': 'docker.svg',
  'makefile': 'code-gray.svg',
  '.gitignore': 'git.svg',
  '.gitattributes': 'git.svg',
  '.env': 'brackets-yellow.svg',
  '.env.local': 'brackets-yellow.svg',
  '.env.production': 'brackets-yellow.svg',
  'readme.md': 'markdown.svg',
  'go.mod': 'go-mod.svg',
  'go.sum': 'go-mod.svg',
  'license': 'license.svg',
};

const EXTENSION_MAP: Record<string, string> = {
  tsx: 'react-ts.svg',
  jsx: 'react.svg',
  ts: 'ts.svg',
  js: 'js.svg',
  mjs: 'js.svg',
  cjs: 'js.svg',
  css: 'brackets-sky.svg',
  scss: 'sass.svg',
  sass: 'sass.svg',
  less: 'brackets-sky.svg',
  json: 'brackets-yellow.svg',
  html: 'code-orange.svg',
  htm: 'code-orange.svg',
  py: 'python.svg',
  pyw: 'python.svg',
  ipynb: 'notebook.svg',
  go: 'go.svg',
  md: 'markdown.svg',
  markdown: 'markdown.svg',
  txt: 'text.svg',
  svg: 'svg.svg',
  png: 'image.svg',
  jpg: 'image.svg',
  jpeg: 'image.svg',
  webp: 'image.svg',
  gif: 'gif.svg',
  ico: 'image.svg',
  yml: 'yaml.svg',
  yaml: 'yaml.svg',
  toml: 'brackets-orange.svg',
  sh: 'shell.svg',
  bash: 'shell.svg',
  bat: 'shell.svg',
  ps1: 'code-blue.svg',
  sql: 'database.svg',
  db: 'database.svg',
  lock: 'lock.svg',
  rs: 'rust.svg',
  c: 'c.svg',
  cpp: 'cplus.svg',
  h: 'h.svg',
  hpp: 'cplus.svg',
  java: 'java.svg',
  pdf: 'pdf.svg',
  mp3: 'audio.svg',
  wav: 'audio.svg',
  mp4: 'video.svg',
  webm: 'video.svg',
  vue: 'vue.svg',
  dart: 'dart.svg',
  swift: 'swift.svg',
};

export const StandardFileIcon: React.FC<StandardFileIconProps> = ({
  filename = '',
  isFolder = false,
  isOpen = false,
  size = 15,
  className = '',
  style = {},
}) => {
  const [hasError, setHasError] = useState(false);
  const clean = (filename || '').trim().replace(/^[/\\]+|[/\\]+$/g, '');
  const isDir = isFolder || clean.endsWith('/') || clean.endsWith('\\') || clean === '.' || clean === '..';
  const baseName = clean.split(/[/\\]/).filter(Boolean).pop() || clean;
  const lowerBase = baseName.toLowerCase();

  let iconPath = '';
  if (isDir) {
    const matched = FOLDER_MAP[lowerBase];
    if (matched) {
      iconPath = `/icons/folders/${matched}`;
    } else {
      iconPath = isOpen ? '/icons/folders/folder-open.svg' : '/icons/folders/folder.svg';
    }
  } else {
    const exactMatch = FILE_MAP[lowerBase];
    if (exactMatch) {
      iconPath = `/icons/files/${exactMatch}`;
    } else {
      const ext = lowerBase.split('.').pop() || '';
      const extMatch = EXTENSION_MAP[ext];
      if (extMatch) {
        iconPath = `/icons/files/${extMatch}`;
      } else {
        iconPath = '/icons/files/code-gray.svg';
      }
    }
  }

  if (hasError) {
    return <span style={{ fontSize: `${size}px`, lineHeight: 1, ...style }}>{isDir ? '📁' : '📄'}</span>;
  }

  return (
    <img
      src={iconPath}
      width={size}
      height={size}
      alt=""
      draggable={false}
      onError={() => setHasError(true)}
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        userSelect: 'none',
        objectFit: 'contain',
        ...style,
      }}
    />
  );
};
