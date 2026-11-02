import { saveUserMemory, getUserMemories } from './memoryService';
import { auth } from '../firebaseConfig';

export type UserMood = 
  | 'urgent' 
  | 'stressed' 
  | 'frustrated' 
  | 'enthusiastic' 
  | 'curious' 
  | 'tired' 
  | 'cheerful' 
  | 'thoughtful' 
  | 'neutral';

export interface SentimentAnalysisResult {
  mood: UserMood;
  confidence: number;
  energyLevel: 'high' | 'medium' | 'low';
  valence: 'positive' | 'negative' | 'neutral';
  suggestedTone: string;
  detectedKeywords: string[];
}

// Heuristic keyword dictionary for fast, zero-latency sentiment inference
const MOOD_KEYWORDS: Record<UserMood, string[]> = {
  urgent: ['asap', 'hurry', 'urgent', 'immediately', 'quick', 'fast', 'deadline', 'running out of time', 'emergency', 'right now'],
  stressed: ['stressed', 'overwhelmed', 'too much work', 'panicking', 'pressure', 'crazy day', 'headache', 'drowning', 'anxious'],
  frustrated: ['annoying', 'broken', 'not working', 'ugh', 'waste of time', 'hate this', 'terrible', 'ridiculous', 'stupid', 'mess'],
  enthusiastic: ['awesome', 'brilliant', 'great', 'love this', 'excited', 'fantastic', 'amazing', 'lets go', 'super', 'pumped'],
  curious: ['what if', 'how does', 'why do you think', 'what do you think', 'could we try', 'wondering', 'tell me more', 'explore'],
  tired: ['exhausted', 'tired', 'long day', 'sleepy', 'drained', 'cant think', 'need a break', 'burnt out'],
  cheerful: ['good morning', 'thanks mate', 'having a good day', 'nice', 'cool', 'cheers', 'pleasure', 'haha', 'lol'],
  thoughtful: ['personally', 'considering', 'analyzing', 'reflecting', 'in my opinion', 'weighing', 'options', 'strategy'],
  neutral: [],
};

const TONE_ADAPTATIONS: Record<UserMood, string> = {
  urgent: 'Direct, laser-focused, extremely concise, zero fluff. Deliver answers and actions immediately.',
  stressed: 'Calm, reassuring, supportive, and efficient. Take the burden off their shoulders and simplify.',
  frustrated: 'Empathetic, clear, and action-oriented. Validate their issue without arguing and solve it smoothly.',
  enthusiastic: 'Spirited, engaging, high-energy creative partner. Share bold ideas and banter enthusiastically.',
  curious: 'Inquisitive, deep, exploratory. Offer personal opinions, creative alternatives, and interesting angles.',
  tired: 'Gentle, comforting, highly structured, minimal cognitive load. Summarize into simple digestible points.',
  cheerful: 'Warm, friendly, witty, companionable. Keep up natural camaraderie and light dry humor.',
  thoughtful: 'Strategic, analytical, nuanced. Provide balanced pros/cons and thoughtful recommendations.',
  neutral: 'Professional, friendly, sharp, and helpful.',
};

/**
 * Analyzes the user's speech transcript or text message for emotional sentiment and mood.
 */
export function analyzeSentiment(text: string): SentimentAnalysisResult {
  if (!text || !text.trim()) {
    return {
      mood: 'neutral',
      confidence: 0.5,
      energyLevel: 'medium',
      valence: 'neutral',
      suggestedTone: TONE_ADAPTATIONS.neutral,
      detectedKeywords: [],
    };
  }

  const clean = text.toLowerCase().trim();
  const detectedKeywords: string[] = [];
  const scores: Record<UserMood, number> = {
    urgent: 0,
    stressed: 0,
    frustrated: 0,
    enthusiastic: 0,
    curious: 0,
    tired: 0,
    cheerful: 0,
    thoughtful: 0,
    neutral: 0.1,
  };

  // Check keyword matches
  (Object.keys(MOOD_KEYWORDS) as UserMood[]).forEach(mood => {
    MOOD_KEYWORDS[mood].forEach(keyword => {
      if (clean.includes(keyword)) {
        scores[mood] += 1;
        detectedKeywords.push(keyword);
      }
    });
  });

  // Punctuation and style heuristics
  if (text.includes('!!!') || text.toUpperCase() === text && text.length > 8) {
    scores.urgent += 0.8;
    scores.frustrated += 0.5;
  }
  if (text.includes('?') && (clean.startsWith('what do you think') || clean.startsWith('why dont we'))) {
    scores.curious += 1.5;
    scores.thoughtful += 1.0;
  }

  // Find top mood
  let topMood: UserMood = 'neutral';
  let maxScore = 0;
  (Object.keys(scores) as UserMood[]).forEach(mood => {
    if (scores[mood] > maxScore) {
      maxScore = scores[mood];
      topMood = mood;
    }
  });

  const valence: 'positive' | 'negative' | 'neutral' = 
    ['enthusiastic', 'cheerful'].includes(topMood) ? 'positive' :
    ['stressed', 'frustrated', 'tired'].includes(topMood) ? 'negative' : 'neutral';

  const energyLevel: 'high' | 'medium' | 'low' =
    ['urgent', 'enthusiastic', 'frustrated'].includes(topMood) ? 'high' :
    ['tired'].includes(topMood) ? 'low' : 'medium';

  return {
    mood: topMood,
    confidence: maxScore > 0 ? Math.min(0.95, 0.5 + maxScore * 0.2) : 0.5,
    energyLevel,
    valence,
    suggestedTone: TONE_ADAPTATIONS[topMood],
    detectedKeywords,
  };
}

const LAST_SENTIMENT_KEY = 'hubmind_current_user_mood_v2';
function moodStorageKey(userId?: string) { return `${LAST_SENTIMENT_KEY}_${userId || auth.currentUser?.uid || 'anonymous'}`; }

/**
 * Tracks the sentiment of a conversation turn and persists significant mood patterns to user memory.
 */
export async function trackAndPersistSentiment(userId: string, userText: string): Promise<SentimentAnalysisResult> {
  const result = analyzeSentiment(userText);

  try {
    localStorage.setItem(moodStorageKey(userId), JSON.stringify({ ...result, recordedAt: new Date().toISOString() }));
  } catch {}

  // Persist meaningful emotional state twice: a stable latest-state record for fast
  // prompt guidance and an append-only interaction record for long-term understanding.
  if (userId && result.mood !== 'neutral' && result.confidence >= 0.7) {
    try {
      const now = new Date().toISOString();
      await Promise.all([
        saveUserMemory(userId, {
          key: 'current_mood_state',
          content: `Latest detected emotional state: ${result.mood}. Energy: ${result.energyLevel}. Valence: ${result.valence}. Recommended AI tone: ${result.suggestedTone}`,
          category: 'interaction',
          importance: 'medium',
          source: 'system',
        }),
        saveUserMemory(userId, {
          key: `mood_event_${Date.now()}`,
          content: `Detected ${result.mood} mood (confidence ${Math.round(result.confidence * 100)}%, energy ${result.energyLevel}, valence ${result.valence}). Keywords: ${result.detectedKeywords.join(', ') || 'none'}.`,
          category: 'interaction',
          importance: 'low',
          source: 'system',
        }),
      ]);
    } catch (err) {
      console.warn('[SentimentService] Failed to persist sentiment memory:', err);
    }
  }

  return result;
}

export function getCurrentUserMoodGuidance(): string {
  try {
    const raw = localStorage.getItem(moodStorageKey());
    if (raw) {
      const parsed: SentimentAnalysisResult = JSON.parse(raw);
      if (parsed.mood && parsed.mood !== 'neutral') {
        return `CURRENT USER EMOTIONAL STATE: ${parsed.mood.toUpperCase()} (Energy: ${parsed.energyLevel}).\nTONE GUIDELINE: ${parsed.suggestedTone}`;
      }
    }
  } catch {}
  return 'CURRENT USER EMOTIONAL STATE: NEUTRAL. Maintain a warm, friendly, witty, and helpful conversational presence.';
}
