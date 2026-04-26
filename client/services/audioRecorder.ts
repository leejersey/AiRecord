/**
 * 录音服务 — 封装 expo-av 录音 API
 */
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

export interface RecordingResult {
  uri: string;
  duration: number; // 秒
  fileSize: number; // 字节
  blob?: Blob; // Web 平台专用：录音文件的 Blob 对象
}

// 录音配置：高质量 AAC
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

let currentRecording: Audio.Recording | null = null;

/**
 * 请求录音权限
 */
export async function requestPermissions(): Promise<boolean> {
  const { granted } = await Audio.requestPermissionsAsync();
  if (granted) {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
  }
  return granted;
}

/**
 * 开始录音
 */
export async function startRecording(): Promise<void> {
  const hasPermission = await requestPermissions();
  if (!hasPermission) {
    throw new Error('未获得录音权限');
  }

  // 如果之前有未关闭的录音，先停掉
  if (currentRecording) {
    try {
      await currentRecording.stopAndUnloadAsync();
    } catch {}
    currentRecording = null;
  }

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(RECORDING_OPTIONS);
  await recording.startAsync();
  currentRecording = recording;
}

/**
 * 暂停录音
 */
export async function pauseRecording(): Promise<void> {
  if (!currentRecording) return;
  await currentRecording.pauseAsync();
}

/**
 * 恢复录音
 */
export async function resumeRecording(): Promise<void> {
  if (!currentRecording) return;
  await currentRecording.startAsync();
}

/**
 * 停止录音并返回文件信息
 */
export async function stopRecording(): Promise<RecordingResult> {
  if (!currentRecording) {
    throw new Error('当前没有正在进行的录音');
  }

  await currentRecording.stopAndUnloadAsync();
  const uri = currentRecording.getURI();
  const status = await currentRecording.getStatusAsync();

  if (!uri) {
    throw new Error('录音文件 URI 为空');
  }

  let blob: Blob | undefined;
  let fileSize = 0;

  // Web 平台：将 blob: URI 转为真正的 Blob 对象
  if (Platform.OS === 'web') {
    try {
      const response = await fetch(uri);
      blob = await response.blob();
      fileSize = blob.size;
    } catch (e) {
      console.error('Web 平台获取录音 Blob 失败:', e);
    }
  }

  const result: RecordingResult = {
    uri,
    duration: (status as any).durationMillis ? (status as any).durationMillis / 1000 : 0,
    fileSize,
    blob,
  };

  currentRecording = null;

  // 恢复播放模式（仅原生平台需要）
  if (Platform.OS !== 'web') {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });
  }

  return result;
}

/**
 * 获取当前录音状态（用于更新 UI 计时器）
 */
export async function getRecordingStatus(): Promise<Audio.RecordingStatus | null> {
  if (!currentRecording) return null;
  return await currentRecording.getStatusAsync();
}

/**
 * 当前是否有活跃录音
 */
export function isRecordingActive(): boolean {
  return currentRecording !== null;
}
