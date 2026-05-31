export const DOCS_HOST_SUFFIXES = [
  '.readthedocs.io',
  '.readthedocs.org',
  '.gitbook.io',
  '.netlify.app',
  '.vercel.app',
  'docs.rs',
];

export const DOCS_HOST_PREFIXES = ['docs.', 'developer.', 'dev.', 'wiki.'];
export const MAX_REDIRECTS = 10;
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
export const MAX_BINARY_DOWNLOAD_BYTES = 2 * 1024 * 1024;
export const DEFAULT_TIMEOUT_SECONDS = 30;
export const MAX_TIMEOUT_SECONDS = 120;
export const MAX_LLMS_PROBE_TIMEOUT_MS = 8000;
export const MAX_MODEL_CONTENT_CHARS = 100_000;
export const DEFAULT_ACCEPT_LANGUAGE = 'en;q=0.8,*;q=0.5';
export const BINARY_PREFIXES = [
  'image/',
  'audio/',
  'video/',
  'application/pdf',
  'application/zip',
  'application/octet-stream',
];

export const WEBFETCH_DESCRIPTION =
  '获取 URL 内容，针对静态/文档页面优化。支持 llms.txt 探测、内容聚焦的 HTML 提取、元数据、重定向，以及由廉价辅助模型处理的可选提示。';
