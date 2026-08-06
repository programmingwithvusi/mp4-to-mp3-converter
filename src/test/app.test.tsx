// App.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
} from '@testing-library/react';

import App from '../App';
import { IDBFactory } from 'fake-indexeddb';

const mockConvert = vi.fn();

vi.mock('../hooks/useFfmpeg', () => ({
  useFfmpeg: () => ({
    load: vi.fn(),
    convert: mockConvert,
    loadState: 'ready',
    loadError: null,
  }),
}));

function makeFile(name: string, sizeBytes = 1024): File {
  const file = new File(['x'], name, { type: 'video/mp4' });
  Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true });
  return file;
}

beforeEach(() => {
  vi.stubEnv('VITE_DAILY_LIMIT', '5');
  localStorage.clear();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB =
    new IDBFactory();
  mockConvert.mockReset();
  mockConvert.mockResolvedValue(new Blob(['fake mp3'], { type: 'audio/mpeg' }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});
describe('App', () => {
  it('adds a dropped file to the queue', async () => {
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeFile('clip.mp4')] },
    });
    expect(await screen.findByText('clip.mp4')).toBeInTheDocument();
  });

  it('rejects a file over the size limit with an inline error', async () => {
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;
    const hugeFile = makeFile('huge.mp4', 600 * 1024 * 1024); // over your 500MB cap
    fireEvent.drop(dropzone, { dataTransfer: { files: [hugeFile] } });
    expect(await screen.findByText(/exceeds.*size limit/i)).toBeInTheDocument();
  });

  it('converts a queued file and shows it as done', async () => {
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeFile('clip.mp4')] },
    });

    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /convert to mp3/i }),
      );
    });

    await waitFor(() => expect(mockConvert).toHaveBeenCalledTimes(1));

    expect(await screen.findByText(/1\/5 today/i)).toBeInTheDocument();
  });

  it('blocks conversion once the daily quota is exhausted', async () => {
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;
    // Queue 6 files, one over the limit of 5
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`clip${i}.mp4`));

    await act(async () => {
      fireEvent.drop(dropzone, { dataTransfer: { files } });
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /convert to mp3/i }),
      );
    });

    await waitFor(() => expect(mockConvert).toHaveBeenCalledTimes(5));

    expect(
      await act(() => screen.findByTestId(/limit-message/i)),
    ).toBeInTheDocument();
  });

  it('retries only failed, non-invalid jobs', async () => {
    mockConvert
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(new Blob(['x']));
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeFile('clip.mp4')] },
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /convert to mp3/i }),
      );
    });
    await act(() => screen.findByText(/boom/i));
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /retry failed/i }),
      );
    });
    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: /convert to mp3/i }),
      );
    });
    await waitFor(() => expect(mockConvert).toHaveBeenCalledTimes(2));
  });

  it('renders progress bars with correct ARIA attributes', async () => {
    render(<App />);
    const dropzone = screen
      .getByText(/drag video files here/i)
      .closest('section')!;
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [makeFile('clip.mp4')] },
    });

    const progressbar = await screen.findByRole('progressbar', {
      name: /clip\.mp4 conversion progress/i,
    });
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });
});
