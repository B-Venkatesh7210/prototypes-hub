# Gradium Captions

Karaoke captions for every language you sell in, built on [Gradium](https://gradium.ai/) voice AI. It started from the open-source [Karaoke Captions](https://github.com/B-Venkatesh7210/karaoke-captions) app, with the Whisper engine swapped for Gradium's speech-to-text, text-to-speech, voice cloning and speech translation.

It is a showcase, so every product has demo limits that keep credit use low (see [Demo limits](#demo-limits)).

Three products feed one studio:

| Product | Route | What happens | Gradium APIs |
| --- | --- | --- | --- |
| Record once, ship in 5 | `/dub` | Upload a clip of up to 10 seconds of someone speaking English. It is transcribed, the speaker's voice is cloned (or flagship voices are used), and the clip is dubbed into up to 4 languages with karaoke captions on the video. Longer clips are rejected at upload. | STT, Instant Clone, STT translation, TTS |
| Script to voice | `/script` | Type a script, pick a flagship, designed or cloned voice, and get a voice-over with word timings. | TTS, Voice Design, Instant Clone, STT translation |
| Live captions | `/live` | Talk to your webcam (or just the mic) and watch captions appear on top as you speak. When you stop, the session opens in the studio with the camera video. | Realtime STT (WebSocket) |

The studio (`/studio/[id]`) does the rest:
- canvas preview with the same renderer that exports the video
- timeline with waveform, a word-chip transcript editor with undo/redo, find and replace, and review of low-confidence words
- **Re-voice** to re-speak a single edited line and splice it into the audio
- script regeneration, adding languages, caption presets and full styling
- an "Original sound" slider for dubs, which keeps the clip's music and room sound under the new voice
- MP4, SRT, VTT, ASS karaoke, `words.json` and WAV exports

### Dubbing

Each dub starts when the original speaker starts. It is time-stretched (between 0.92× and 1.35×, pitch preserved) so it ends with the clip, and its word timings are scaled to match. If a translation is still too long at 1.35×, the studio shows how far it overruns, so you can shorten the script and regenerate. This is voice dubbing with captions, not lip sync.

### Live camera

The Live page records with the camera by default; "Mic only" switches back to a captions-only stage for stream overlays.

- The webcam opens at the best resolution it offers (up to 4K). The preview and the project use the camera's own shape, with no aspect picker. The preview is mirrored like a selfie view; the recording isn't.
- The raw camera video is recorded with `MediaRecorder` at a bitrate that scales with the resolution. Captions are not burned in, so they stay editable. When you stop, the recording is copied into a regular MP4 (no re-encode when the codecs allow), so the studio can seek it.
- The studio project uses the video's own sound as the live track, and shifts the caption timings by the gap between the start of the recording and the start of audio capture, so captions stay in sync.
- Captions sit at the bottom center over video (camera sessions and dubs), so they don't cover faces. The Live page and the studio both have a Top / Middle / Bottom control; exports follow it.

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
| Voices | clone samples capped at 15 s, 3 cloned voices per account (lifetime, no delete), 3 voice designs (2 candidates each) a day |
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

## Voice previews

Every flagship voice has a stored preview in `public/previews/<voiceId>.wav`, listed in `src/lib/preview-manifest.json`. The voice picker plays these files directly, so previews are free and work in mock mode too. Only designed-voice candidates are synthesized on demand, because each one is unique.

The files were generated once with Gradium (4,047 credits for 71 voices). To add previews for new voices, or after changing a sample line in `src/lib/previews.ts` (delete that language's files first):

```bash
npm run previews          # dry run: lists missing previews and their cost
npm run previews -- --yes # generates only the missing ones
```

## Your voices

Cloned voices and kept designs are saved on the Gradium account, so they show up under **Your voices** at the top of the **Clone my voice** tab in every voice picker, in any session or project. You name a voice when you clone or keep it. The list is read from `GET /voices/` (non-catalog voices; clones are the ones with a sample file). In mock mode it's a local list in `.data/voices/mock-voices.json`.

- Each account can make at most 3 clones in the demo, and there is no delete option. `/api/voices/clone` counts the account's clones and returns 403 at the cap. The dub flow and the Studio's "fix lines in your voice" panel then offer saved voices instead.
- Previews are always spoken in the saved voice, so playing one proves the clone works. Right after cloning, the new voice speaks one sample line (about 57 credits, once). A kept design reuses the candidate audio you already heard. Previews are stored in `.data/voices/<voiceId>.wav`, served free by `/api/voices/sample`, and replay at no cost. Voices without one (for example clones made in the dub flow) show a dashed play button that generates it once.
- The recording a clone was made from is kept as `.data/voices/<voiceId>.source.wav`. It's never played as the preview.
- `.data/` is gitignored because it holds voice recordings.

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
