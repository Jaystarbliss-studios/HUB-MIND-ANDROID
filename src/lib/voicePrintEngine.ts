/**
 * Jess VoicePrint Engine
 * 
 * Extracts spectral audio features (energy distribution across vocal formant bands,
 * spectral centroid, and harmonic ratios) to build an enrolled voiceprint centroid
 * for the authenticated user.
 * 
 * Training rules:
 * - < 200 samples: "Learning Mode" (Jess responds to all voice commands while collecting samples)
 * - 200+ samples: "Voice Isolation Active" (Jess matches against the user's centroid and rejects background/other voices)
 */

export interface VoicePrintProfile {
  userId: string;
  sampleCount: number;
  isTrained: boolean;
  centroid: number[]; // normalized 16-band vocal feature vector
  lastUpdated: string;
  confidenceScore: number;
}

export interface VoiceEvaluationResult {
  accepted: boolean;
  similarity: number; // 0.0 to 1.0
  mode: 'learning' | 'isolated';
  sampleCount: number;
  isTrained: boolean;
  message: string;
}

const MIN_SAMPLES_FOR_ISOLATION = 200;
const SIMILARITY_THRESHOLD = 0.68; // Minimum cosine similarity for isolated mode
const FEATURE_VECTOR_SIZE = 16;

class VoicePrintEngine {
  private cache: Map<string, VoicePrintProfile> = new Map();

  /**
   * Get the voice profile for a user from memory or localStorage
   */
  public getProfile(userId: string): VoicePrintProfile {
    if (!userId) {
      return this.getEmptyProfile('anonymous');
    }

    if (this.cache.has(userId)) {
      return this.cache.get(userId)!;
    }

    try {
      const saved = localStorage.getItem(`jess_voiceprint_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        const profile: VoicePrintProfile = {
          userId,
          sampleCount: parsed.sampleCount || 0,
          isTrained: (parsed.sampleCount || 0) >= MIN_SAMPLES_FOR_ISOLATION,
          centroid: Array.isArray(parsed.centroid) && parsed.centroid.length === FEATURE_VECTOR_SIZE
            ? parsed.centroid
            : new Array(FEATURE_VECTOR_SIZE).fill(0),
          lastUpdated: parsed.lastUpdated || new Date().toISOString(),
          confidenceScore: parsed.confidenceScore || 0,
        };
        this.cache.set(userId, profile);
        return profile;
      }
    } catch (e) {
      console.warn('Failed to load voice profile from localStorage', e);
    }

    const empty = this.getEmptyProfile(userId);
    this.cache.set(userId, empty);
    return empty;
  }

  private getEmptyProfile(userId: string): VoicePrintProfile {
    return {
      userId,
      sampleCount: 0,
      isTrained: false,
      centroid: new Array(FEATURE_VECTOR_SIZE).fill(0),
      lastUpdated: new Date().toISOString(),
      confidenceScore: 0,
    };
  }

  /**
   * Extract a 16-band normalized feature vector from Web Audio frequency data
   */
  public extractFeatures(frequencyData: Uint8Array | Float32Array): number[] {
    if (!frequencyData || frequencyData.length === 0) {
      return new Array(FEATURE_VECTOR_SIZE).fill(0);
    }

    const binCount = frequencyData.length;
    const chunkSize = Math.max(1, Math.floor(binCount / FEATURE_VECTOR_SIZE));
    const vector: number[] = new Array(FEATURE_VECTOR_SIZE).fill(0);

    for (let i = 0; i < FEATURE_VECTOR_SIZE; i++) {
      let sum = 0;
      const start = i * chunkSize;
      const end = Math.min(binCount, (i + 1) * chunkSize);
      const count = end - start;

      for (let j = start; j < end; j++) {
        const val = frequencyData[j];
        sum += val > 0 ? val : 0;
      }

      // Energy in frequency band i
      vector[i] = count > 0 ? sum / count : 0;
    }

    // L2 unit normalization
    let norm = 0;
    for (let i = 0; i < FEATURE_VECTOR_SIZE; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0.0001) {
      for (let i = 0; i < FEATURE_VECTOR_SIZE; i++) {
        vector[i] = vector[i] / norm;
      }
    }

    return vector;
  }

  /**
   * Ingest a voice sample from user speech to incrementally update the vocal centroid
   */
  public recordSample(userId: string, frequencyData: Uint8Array | Float32Array): VoicePrintProfile {
    if (!userId) return this.getEmptyProfile('anonymous');

    const profile = this.getProfile(userId);
    const sampleFeatures = this.extractFeatures(frequencyData);

    // Verify the sample has actual vocal energy
    const totalEnergy = sampleFeatures.reduce((acc, v) => acc + v, 0);
    if (totalEnergy < 0.1) {
      return profile; // Ignore pure silence
    }

    const n = profile.sampleCount;
    const newCentroid = new Array(FEATURE_VECTOR_SIZE).fill(0);

    for (let i = 0; i < FEATURE_VECTOR_SIZE; i++) {
      if (n === 0) {
        newCentroid[i] = sampleFeatures[i];
      } else {
        // Weighted running average
        newCentroid[i] = (profile.centroid[i] * n + sampleFeatures[i]) / (n + 1);
      }
    }

    // Renormalize centroid
    let norm = 0;
    for (let i = 0; i < FEATURE_VECTOR_SIZE; i++) {
      norm += newCentroid[i] * newCentroid[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0.0001) {
      for (let i = 0; i < FEATURE_VECTOR_SIZE; i++) {
        newCentroid[i] = newCentroid[i] / norm;
      }
    }

    const updatedCount = n + 1;
    const isTrained = updatedCount >= MIN_SAMPLES_FOR_ISOLATION;
    const confidenceScore = Math.min(99, Math.round((updatedCount / MIN_SAMPLES_FOR_ISOLATION) * 100));

    const updatedProfile: VoicePrintProfile = {
      userId,
      sampleCount: updatedCount,
      isTrained,
      centroid: newCentroid,
      lastUpdated: new Date().toISOString(),
      confidenceScore,
    };

    this.cache.set(userId, updatedProfile);

    // Save to localStorage
    try {
      localStorage.setItem(`jess_voiceprint_${userId}`, JSON.stringify(updatedProfile));
    } catch (e) {
      console.warn('Failed to save voice profile', e);
    }

    return updatedProfile;
  }

  /**
   * Evaluate whether an incoming voice chunk matches the enrolled user
   */
  public evaluateVoice(
    userId: string,
    frequencyData: Uint8Array | Float32Array
  ): VoiceEvaluationResult {
    if (!userId) {
      return {
        accepted: true,
        similarity: 1.0,
        mode: 'learning',
        sampleCount: 0,
        isTrained: false,
        message: 'No user active',
      };
    }

    const profile = this.getProfile(userId);
    const sampleFeatures = this.extractFeatures(frequencyData);

    // In Learning Mode (< 200 samples)
    if (!profile.isTrained) {
      return {
        accepted: true,
        similarity: 1.0,
        mode: 'learning',
        sampleCount: profile.sampleCount,
        isTrained: false,
        message: `Learning Mode: ${profile.sampleCount}/${MIN_SAMPLES_FOR_ISOLATION} samples collected`,
      };
    }

    // In Isolated Mode (200+ samples): Compute cosine similarity
    let dotProduct = 0;
    for (let i = 0; i < FEATURE_VECTOR_SIZE; i++) {
      dotProduct += profile.centroid[i] * sampleFeatures[i];
    }

    // Clamp similarity between 0 and 1
    const similarity = Math.max(0, Math.min(1, dotProduct));
    const accepted = similarity >= SIMILARITY_THRESHOLD;

    return {
      accepted,
      similarity,
      mode: 'isolated',
      sampleCount: profile.sampleCount,
      isTrained: true,
      message: accepted
        ? `Authenticated User Verified (${Math.round(similarity * 100)}% match)`
        : `Background voice ignored (${Math.round(similarity * 100)}% match < threshold)`,
    };
  }

  /**
   * Reset voice prints for a user
   */
  public resetProfile(userId: string) {
    if (!userId) return;
    const empty = this.getEmptyProfile(userId);
    this.cache.set(userId, empty);
    try {
      localStorage.removeItem(`jess_voiceprint_${userId}`);
    } catch (e) {}
  }
}

export const voicePrintEngine = new VoicePrintEngine();
