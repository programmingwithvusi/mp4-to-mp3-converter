// utils.test.ts
import { describe, it, expect } from 'vitest'
import { isAcceptedFile, formatBytes, mpThreeNameFor } from '../utils'

function makeFile(name: string): File {
    return new File(['x'], name)
}

describe('isAcceptedFile', () => {
    it('accepts known video extensions, case-insensitively', () => {
        expect(isAcceptedFile(makeFile('clip.MP4'))).toBe(true)
        expect(isAcceptedFile(makeFile('clip.mkv'))).toBe(true)
    })

    it('rejects unsupported extensions', () => {
        expect(isAcceptedFile(makeFile('notes.txt'))).toBe(false)
        expect(isAcceptedFile(makeFile('image.png'))).toBe(false)
    })
})

describe('formatBytes', () => {
    it('formats bytes under 1024 as B', () => {
        expect(formatBytes(512)).toBe('512 B')
    })

    it('formats KB and MB with one decimal', () => {
        expect(formatBytes(2048)).toBe('2.0 KB')
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    })
})

describe('mp3NameFor', () => {
    it('replaces the extension with .mp3', () => {
        expect(mpThreeNameFor('vacation.mp4')).toBe('vacation.mp3')
        expect(mpThreeNameFor('clip.final.mov')).toBe('clip.final.mp3')
    })

    it('handles filenames with no extension', () => {
        expect(mpThreeNameFor('novideo')).toBe('novideo.mp3')
    })
})