import { useCallback, useRef, useState } from 'react'
/*
import {
  Input,
  Output,
  Conversion,
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Mp3OutputFormat,
  canEncodeAudio,
} from 'mediabunny'
import { registerMp3Encoder } from '@mediabunny/mp3-encoder'
*/
export type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function useFfmpeg() {
  const readyRef = useRef(false)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (readyRef.current || loadState === 'loading') return
    setLoadState('loading')
    setLoadError(null)
    try {
      const { canEncodeAudio } = await import('mediabunny')
      if (!(await canEncodeAudio('mp3'))) {
        const { registerMp3Encoder } = await import('@mediabunny/mp3-encoder')
        registerMp3Encoder()
      }
      readyRef.current = true
      setLoadState('ready')
    } catch (err) {
      console.error(err)
      setLoadError(err instanceof Error ? err.message : 'Failed to prepare the converter engine.')
      setLoadState('error')
    }
  }, [loadState])

  const convert = useCallback(
    async (file: File, bitrate: string, onProgress: (ratio: number) => void): Promise<Blob> => {
      const { Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, Mp3OutputFormat } = await import(
        'mediabunny'
      )

      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      const output = new Output({ format: new Mp3OutputFormat(), target: new BufferTarget() })

      const conversion = await Conversion.init({
        input,
        output,
        audio: { bitrate: bpsFromLabel(bitrate) },
      })

      if (!conversion.isValid) {
        throw new Error('No audio track could be extracted from this file.')
      }

      conversion.onProgress = onProgress
      await conversion.execute()

      const buffer = output.target.buffer
      if (!buffer) throw new Error('Conversion produced no output.')
      return new Blob([buffer], { type: 'audio/mpeg' })
    },
    []
  )

  return { load, convert, loadState, loadError }
}

/*
export function useFfmpeg() {
  const readyRef = useRef(false)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (readyRef.current || loadState === 'loading') return
    setLoadState('loading')
    setLoadError(null)
    try {
      // Register the WASM LAME encoder only if the browser can't
      // natively encode MP3 via WebCodecs.
      if (!(await canEncodeAudio('mp3'))) {
        registerMp3Encoder()
      }
      readyRef.current = true
      setLoadState('ready')
    } catch (err) {
      console.error(err)
      setLoadError(err instanceof Error ? err.message : 'Failed to prepare the converter engine.')
      setLoadState('error')
    }
  }, [loadState])

  // Converts one file, reporting 0..1 progress via onProgress.
  const convert = useCallback(
    async (file: File, bitrate: string, onProgress: (ratio: number) => void): Promise<Blob> => {
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      const output = new Output({ format: new Mp3OutputFormat(), target: new BufferTarget() })

      const conversion = await Conversion.init({
        input,
        output,
        audio: { bitrate: bpsFromLabel(bitrate) },
      })

      if (!conversion.isValid) {
        // e.g. file has no audio track at all
        throw new Error('No audio track could be extracted from this file.')
      }

      conversion.onProgress = onProgress
      await conversion.execute()

      const buffer = output.target.buffer
      if (!buffer) throw new Error('Conversion produced no output.')
      return new Blob([buffer], { type: 'audio/mpeg' })
    },
    []
  )

  return { load, convert, loadState, loadError }
}
*/

// '192k' -> 192000 bits/sec
function bpsFromLabel(bitrate: string): number {
  return parseInt(bitrate, 10) * 1000
}

