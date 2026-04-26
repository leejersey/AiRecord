/**
 * 录音全局状态管理 — Zustand
 */
import { create } from 'zustand';
import { Platform } from 'react-native';
import { Recording, SceneType, RecordingStatus } from '@/types';
import { api } from '@/services/api';
import * as recorder from '@/services/audioRecorder';

interface RecordingState {
  // 录音状态
  isRecording: boolean;
  isPaused: boolean;
  elapsedSeconds: number;
  selectedScene: SceneType;

  // 当前处理中的录音
  activeRecordingId: string | null;
  activeStatus: RecordingStatus | null;

  // 数据
  recordings: Recording[];
  currentRecording: Recording | null;
  isLoading: boolean;
  error: string | null;

  // 录音操作
  setScene: (scene: SceneType) => void;
  startRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  stopAndUpload: (title?: string) => Promise<void>;
  updateElapsed: (seconds: number) => void;

  // 后端交互
  fetchRecordings: (sceneType?: SceneType) => Promise<void>;
  fetchRecording: (id: string) => Promise<void>;
  triggerTranscribe: (id: string) => Promise<void>;
  triggerAnalyze: (id: string) => Promise<void>;
  pollStatus: (id: string) => Promise<void>;
  deleteRecording: (id: string) => Promise<void>;

  // 清理
  clearError: () => void;
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  // 初始状态
  isRecording: false,
  isPaused: false,
  elapsedSeconds: 0,
  selectedScene: 'meeting',
  activeRecordingId: null,
  activeStatus: null,
  recordings: [],
  currentRecording: null,
  isLoading: false,
  error: null,

  setScene: (scene) => set({ selectedScene: scene }),

  startRecording: async () => {
    try {
      await recorder.startRecording();
      set({ isRecording: true, isPaused: false, elapsedSeconds: 0, error: null });
    } catch (e: any) {
      set({ error: e.message || '录音启动失败' });
    }
  },

  pauseRecording: async () => {
    await recorder.pauseRecording();
    set({ isPaused: true });
  },

  resumeRecording: async () => {
    await recorder.resumeRecording();
    set({ isPaused: false });
  },

  stopAndUpload: async (title?: string) => {
    try {
      const result = await recorder.stopRecording();
      set({ isRecording: false, isPaused: false });

      // 上传到后端
      const formData = new FormData();

      if (Platform.OS === 'web') {
        // Web 平台：使用真正的 Blob 对象
        if (result.blob) {
          const file = new File([result.blob], 'recording.webm', { type: 'audio/webm' });
          formData.append('file', file);
        } else {
          throw new Error('Web 录音文件获取失败');
        }
      } else {
        // 原生平台：使用 { uri, type, name } 格式
        formData.append('file', {
          uri: result.uri,
          type: 'audio/m4a',
          name: 'recording.m4a',
        } as any);
      }

      formData.append('scene_type', get().selectedScene);
      if (title) {
        formData.append('title', title);
      }

      set({ isLoading: true });
      const response = await api.post('/recordings/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000, // 上传可能较慢
      });

      const recording = response.data as Recording;
      set({
        activeRecordingId: recording.id,
        activeStatus: recording.status as RecordingStatus,
        isLoading: false,
      });

      // 刷新录音列表
      await get().fetchRecordings();

      // 自动触发转写
      await get().triggerTranscribe(recording.id);

    } catch (e: any) {
      console.error('录音上传失败:', e);
      set({ isLoading: false, error: e.message || '上传失败' });
    }
  },

  updateElapsed: (seconds) => set({ elapsedSeconds: seconds }),

  fetchRecordings: async (sceneType?) => {
    set({ isLoading: true });
    try {
      const params: any = {};
      if (sceneType) params.scene_type = sceneType;
      const response = await api.get('/recordings', { params });
      set({ recordings: response.data.items, isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message || '获取列表失败' });
    }
  },

  fetchRecording: async (id) => {
    set({ isLoading: true });
    try {
      const response = await api.get(`/recordings/${id}`);
      set({ currentRecording: response.data, isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message || '获取详情失败' });
    }
  },

  triggerTranscribe: async (id) => {
    try {
      await api.post(`/recordings/${id}/transcribe`);
      set({ activeRecordingId: id, activeStatus: 'transcribing' });
      // 开始轮询
      get().pollStatus(id);
    } catch (e: any) {
      set({ error: e.message || '转写触发失败' });
    }
  },

  triggerAnalyze: async (id) => {
    try {
      await api.post(`/recordings/${id}/analyze`);
      set({ activeRecordingId: id, activeStatus: 'analyzing' });
      get().pollStatus(id);
    } catch (e: any) {
      set({ error: e.message || '分析触发失败' });
    }
  },

  pollStatus: async (id) => {
    const poll = async () => {
      try {
        const response = await api.get(`/recordings/${id}/status`);
        const { status, error_message } = response.data;

        set({ activeStatus: status });

        if (status === 'transcribed') {
          // 转写完成，自动触发分析
          await get().triggerAnalyze(id);
          return;
        }

        if (status === 'done') {
          // 全部完成，刷新详情
          await get().fetchRecording(id);
          set({ activeRecordingId: null, activeStatus: null });
          return;
        }

        if (status === 'failed') {
          set({ error: error_message || '处理失败', activeRecordingId: null, activeStatus: null });
          return;
        }

        // 继续轮询
        setTimeout(poll, 3000);
      } catch (e) {
        setTimeout(poll, 5000); // 网络错误，延长轮询间隔
      }
    };

    setTimeout(poll, 2000); // 首次延迟 2s
  },

  deleteRecording: async (id) => {
    try {
      await api.delete(`/recordings/${id}`);
      set((state) => ({
        recordings: state.recordings.filter((r) => r.id !== id),
      }));
    } catch (e: any) {
      set({ error: e.message || '删除失败' });
    }
  },

  clearError: () => set({ error: null }),
}));
