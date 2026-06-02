#!/usr/bin/env node

// Generate Q2-Q6 TTS MP3 files using ElevenLabs API
// Usage: ELEVENLABS_API_KEY=sk_... node scripts/generate-tts.mjs

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public', 'audio');

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY environment variable');
  process.exit(1);
}

// Rachel voice — warm, calm, female. Good for reflection prompts.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'MClEFoImJXBTgLwdLI5n';

const QUESTIONS = [
  // Q1 is dynamic (generated at runtime via Edge Function) — skip
  null,
  'How did those things make you feel? What emotions stemmed from today?',
  'What memories did you make today? What stuck with you?',
  'Was there anything interesting you learned today?',
  'Was there anything interesting you learned about yourself today? What caused it?',
  'Anything else?',
];

async function generateTTS(text, outputPath) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.75,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error for "${text.slice(0, 40)}...": ${response.status} ${err}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, buffer);
  console.log(`✓ Generated: ${outputPath} (${(buffer.length / 1024).toFixed(1)}KB)`);
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (let i = 1; i < QUESTIONS.length; i++) {
    const question = QUESTIONS[i];
    if (!question) continue;

    const outputPath = join(OUTPUT_DIR, `q${i + 1}.mp3`);
    await generateTTS(question, outputPath);

    // Small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\nDone! Q2-Q6 audio files are in public/audio/');
  console.log('Q1 is generated dynamically at runtime via the generate-q1 Edge Function.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
