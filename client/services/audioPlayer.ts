/**
 * 音频播放器服务 — 封装 expo-av 播放 API
 */
import { Audio, AVPlaybackStatus } from 'expo-av';

let currentSound: Audio.Sound | null = null;
let onStatusUpdate: ((status: AVPlaybackStatus) => void) | null = null;

/**
 * 加载并播放音频
 */
export async function playAudio(uri: string, onStatus?: (status: AVPlaybackStatus) => void): Promise<void> {
  // 先停掉之前的
  await stopAudio();

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true },
    (status) => {
      if (onStatus) onStatus(status);
      if (onStatusUpdate) onStatusUpdate(status);
    }
  );

  currentSound = sound;
  onStatusUpdate = onStatus || null;
}

/**
 * 暂停播放
 */
export async function pauseAudio(): Promise<void> {
  if (currentSound) {
    await currentSound.pauseAsync();
  }
}

/**
 * 恢复播放
 */
export async function resumeAudio(): Promise<void> {
  if (currentSound) {
    await currentSound.playAsync();
  }
}

/**
 * 跳转到指定位置（毫秒）
 */
export async function seekAudio(positionMs: number): Promise<void> {
  if (currentSound) {
    await currentSound.setPositionAsync(positionMs);
  }
}

/**
 * 停止并释放音频
 */
export async function stopAudio(): Promise<void> {
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch {}
    currentSound = null;
    onStatusUpdate = null;
  }
}

/**
 * 从指定位置开始播放（毫秒）
 * 用于「重要时刻」点击跳转
 */
export async function playAudioFromPosition(
  uri: string,
  positionMs: number,
  onStatus?: (status: AVPlaybackStatus) => void
): Promise<void> {
  await stopAudio();

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true, positionMillis: positionMs },
    (status) => {
      if (onStatus) onStatus(status);
      if (onStatusUpdate) onStatusUpdate(status);
    }
  );

  currentSound = sound;
  onStatusUpdate = onStatus || null;
}

/**
 * 当前是否正在播放
 */
export function isPlaying(): boolean {
  return currentSound !== null;
}
