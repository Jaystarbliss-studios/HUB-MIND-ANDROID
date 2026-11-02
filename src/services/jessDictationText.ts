/**
 * Converts explicit spoken punctuation into text while keeping dictation separate
 * from command execution. This module never executes commands or touches the OS.
 *
 * Prefix an utterance with "literal dictation" (or "type literally") to bypass
 * punctuation substitutions for that utterance.
 */
export function normalizeJessDictationTranscript(input: string): string {
  const source = String(input ?? '').trim();
  if (!source) return '';

  const literal = source.match(/^(?:literal\s+dictation|dictate\s+literally|type\s+literally)\s*[:,-]?\s*/i);
  if (literal) return source.slice(literal[0].length).trim();

  const substitutions: Array<[RegExp, string]> = [
    [/\bnew paragraph\b/gi, '\n\n'],
    [/\bnew line\b/gi, '\n'],
    [/\bquestion mark\b/gi, '?'],
    [/\bexclamation (?:mark|point)\b/gi, '!'],
    [/\bfull stop\b/gi, '.'],
    [/\bperiod\b/gi, '.'],
    [/\bcomma\b/gi, ','],
    [/\bcolon\b/gi, ':'],
    [/\bsemicolon\b/gi, ';'],
    [/\bopen quote\b/gi, '"'],
    [/\bclose quote\b/gi, '"'],
    [/\bopen parenthesis\b/gi, '('],
    [/\bclose parenthesis\b/gi, ')'],
  ];

  let text = source;
  for (const [pattern, replacement] of substitutions) text = text.replace(pattern, replacement);

  // Remove whitespace before punctuation, but preserve intentional newlines.
  text = text.replace(/[ \t]+([,.;:!?])/g, '$1');
  text = text.replace(/"\s+/g, '"').replace(/\s+"/g, '"');
  text = text.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  text = text.replace(/([,.;:!?])(?=\S)/g, '$1 ');
  text = text.replace(/[ \t]*\n[ \t]*/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
