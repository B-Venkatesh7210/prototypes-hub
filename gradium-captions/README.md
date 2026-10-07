# Gradium Captions

Karaoke captions for every language you sell in, built on [Gradium](https://gradium.ai/) voice AI. It started from the open-source [Karaoke Captions](https://github.com/B-Venkatesh7210/karaoke-captions) app, with the Whisper engine swapped for Gradium's speech-to-text, text-to-speech, voice cloning and speech translation.

It is a showcase, so every product has demo limits that keep credit use low (see [Demo limits](#demo-limits)).

Three products feed one studio:

| Product | Route | What happens | Gradium APIs |
| --- | --- | --- | --- |
| Record once, ship in 5 | `/dub` | Upload a clip of up to 10 seconds of someone speaking English. It is transcribed, the speaker's voice is cloned (or flagship voices are used), and the clip is dubbed into up to 4 languages with karaoke captions on the video. Longer clips can be trimmed in the browser. | STT, Instant Clone, STT translation, TTS |
| Script to voice | `/script` | Type a script, pick a flagship, designed or cloned voice, and get a voice-over with word timings. | TTS, Voice Design, Instant Clone, STT translation |
| Live captions | `/live` | Talk into the mic and watch captions appear. When you stop, the session opens in the studio. | Realtime STT (WebSocket) |

The studio (`/studio/[id]`) does the rest:
- canvas preview with the same renderer that exports the video
- timeline with waveform, a word-chip transcript editor with undo/redo, find and replace, and review of low-confidence words
- **Re-voice** to re-speak a single edited line and splice it into the audio
- script regeneration, adding languages, caption presets and full styling
- an "Original sound" slider for dubs, which keeps the clip's music and room sound under the new voice
- MP4, SRT, VTT, ASS karaoke, `words.json` and WAV exports

### Dubbing

Each dub starts when the original speaker starts. It is time-stretched (between 0.92× and 1.35×, pitch preserved) so it ends with the clip, and its word timings are scaled to match. If a translation is still too long at 1.35×, the studio shows how far it overruns, so you can shorten the script and regenerate. This is voice dubbing with captions, not lip sync.

### Video export

Export uses WebCodecs (via [Mediabunny](https://mediabunny.dev/)) in Chrome, Edge and Safari 17+. It runs faster than real time.

- **Burned-in (default):** every frame of the upload is decoded, captioned and re-encoded at the source's resolution, frame rate and at least its bitrate. "All languages" exports one MP4 per language.
- **Keep the original video stream (Advanced):** the compressed video is copied bit for bit, with no re-encode. Each selected language is added as its own audio track plus a plain WebVTT subtitle track, all in one MP4. Players like VLC, IINA and QuickTime let viewers switch language. The karaoke styling isn't included, because subtitle tracks are plain text.

Browsers without WebCodecs fall back to recording the canvas in real time at the preset size.

Projects and audio are saved in the browser (IndexedDB). Nothing is uploaded except the calls to Gradium.

## Run it

```bash
npm install
npm run dev   # http://localhost:3000
```

## Mock mode vs live mode

The app runs in **mock mode** by default, so it uses no credits. Every Gradium call is handled by an offline engine with the same request and response shapes:

- **Speech-to-text:** finds the real speech regions in your audio and places words on them, flagging a few as low confidence to exercise review.
- **Text-to-speech:** synthesizes placeholder speech with exact word timings. Each voice gets its own pitch.
- **Cloning and voice design:** return voice IDs that carry the estimated pitch.
- **Translation:** dictionary-based.
- **Video:** dubbing, fitting and export run fully in the browser in both modes, so they are free to test.
- **Live:** the browser speech engine (Chrome, Edge, Safari) or a simulated engine that follows your voice activity.

The banner and the credit meter in the nav show the mode, and estimate what each action would cost.

## Demo limits

All limits are in `src/lib/limits.ts`. Size limits apply in both modes. Daily quotas only count calls that spend real credits.

| Where | Limit |
| --- | --- |
| Record once | 10 s English clip, up to 4 target languages, 5 languages per project |
| Script | 100 words or 600 characters, up to 2 extra languages, 3 per project |
| Live | 60 s per take (auto-stop), 5 Gradium takes an hour |
| Re-voice | lines of up to 25 words, 10 per project |
| Voices | clone samples capped at 15 s, 3 clones and 3 voice designs (2 candidates each) a day |
| Budget | 5,000 credits a day per browser, and the same per visitor IP on the server |

The server enforces its own caps too: 12 s for STT, 65 s for translation, 30 s for clone samples and 700 characters for TTS. It returns 413 when a request is too long and 429 when a quota is used up.

The credit meter in the nav counts down from 5,000 (a simulated budget in mock mode) and, in live mode, shows the real Gradium balance from `/api/credits`. Every live deduction is logged as `[credits]` in both the server terminal and the browser console. A few seconds later the log compares the estimate with how much the Gradium balance actually moved. Calls that land close together are compared as one batch.

A 10-second clip dubbed into 4 languages costs about 30 (STT) + 4 × (40 translation + ~160 TTS) ≈ 830 credits.

To use real Gradium, copy `.env.example` to `.env.local`:

```bash
GRADIUM_API_KEY=gd_...
GRADIUM_MODE=live
GRADIUM_HOST=api     # api | eu.api | us.api
```

The API key never reaches the browser. Live captions use a short-lived single-use token from `/api/live/session`.

## Layout

```
src/app/api/*              server routes: stt, tts, translate, voices, live session, status
src/lib/server/gradium/    provider facade: live.ts (real API) and mock.ts (offline)
src/lib/client/            audio + WAV utils, IndexedDB, pipeline (translate, fit, re-voice), live engines, encode.ts (WebCodecs export)
src/lib/stretch.ts         pitch-preserving time-stretch (WSOLA) used to fit dubs to the clip
src/lib/limits.ts          demo limits and credit prices, shared by client and server
src/lib/captions/          line layout, canvas renderer, styles + presets, subtitle formats, word edits
src/components/            Gradium-style shell, product flows, studio
```

## Notes

- Gradium has no text-only translation. Languages are added with Gradium's STT translation model (`stt-translate`, 4 credits per second) on the source audio, then voiced with TTS. This is much cheaper than speech-to-speech (30 credits per second), because only the translated text is needed. You can edit the translated script and regenerate it.
- Clones work best in the language they were recorded in. Each target language can use a native flagship voice instead.
