export interface ClipboardDetectionResult {
  types: string[];
  hasHtml: boolean;
  hasPlainText: boolean;
  hasImage: boolean;
  hasRtf: boolean;
  hasCustomHubMind: boolean;
  source: 'hubmind' | 'word' | 'teams' | 'google-docs' | 'chatgpt' | 'gemini' | 'notion' | 'generic-html' | 'markdown' | 'plain-text' | 'image' | 'unknown';
  containsTable: boolean;
  containsList: boolean;
  containsHeading: boolean;
  containsLink: boolean;
  containsImage: boolean;
  containsCode: boolean;
  isLikelyMarkdown: boolean;
}

export interface SanitizerOptions {
  preserveColors?: boolean;
  preserveFonts?: boolean;
  preserveAlignments?: boolean;
  stripOfficeBloat?: boolean;
}

export interface NormalizedPasteContent {
  type: 'html' | 'markdown' | 'text' | 'image';
  content: string;
  imageBlob?: Blob;
  meta: {
    source: string;
    originalTypes: string[];
    sanitized: boolean;
    nodeCount?: number;
  };
}
