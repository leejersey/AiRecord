import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { SceneType } from '@/types';
import { useRecordingStore } from '@/stores/recordingStore';
import Waveform from '@/components/Waveform';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function RecordingScreen() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    isRecording, isPaused, elapsedSeconds, selectedScene,
    activeStatus, recordings, isLoading, error,
    setScene, startRecording, pauseRecording, resumeRecording,
    stopAndUpload, updateElapsed, fetchRecordings, clearError,
  } = useRecordingStore();

  const scenes: { type: SceneType; label: string }[] = [
    { type: 'meeting', label: '📋 会议记录' },
    { type: 'interview', label: '🎤 面试分析' },
    { type: 'idea', label: '💡 灵感捕捉' },
  ];

  // 加载最近录音
  useEffect(() => {
    fetchRecordings();
  }, []);

  // 录音计时器
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        updateElapsed(useRecordingStore.getState().elapsedSeconds + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  // 错误提示
  useEffect(() => {
    if (error) {
      Alert.alert('错误', error, [{ text: '确定', onPress: clearError }]);
    }
  }, [error]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handleRecordPress = async () => {
    if (isRecording) {
      await stopAndUpload();
    } else {
      await startRecording();
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      uploaded: '⬆️ 已上传',
      transcribing: '🔄 转写中',
      transcribed: '📝 已转写',
      analyzing: '🤖 分析中',
      done: '✅ 已完成',
      failed: '❌ 失败',
    };
    return map[status] || status;
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.title}>AiRecord</Text>
        {activeStatus && (
          <View style={styles.processingBadge}>
            <Text style={styles.processingText}>{getStatusLabel(activeStatus)}</Text>
          </View>
        )}
      </View>

      {/* Scene Selector */}
      <View style={styles.sceneSelector}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sceneScroll}>
          {scenes.map((scene) => (
            <TouchableOpacity
              key={scene.type}
              style={[styles.sceneChip, selectedScene === scene.type && styles.sceneChipActive]}
              onPress={() => setScene(scene.type)}
              disabled={isRecording}
            >
              <Text style={[styles.sceneText, selectedScene === scene.type && styles.sceneTextActive]}>
                {scene.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Recording Hub */}
      <View style={styles.recordingHub}>
        <Text style={styles.timer}>{formatTime(elapsedSeconds)}</Text>

        {/* 波形动画 */}
        {isRecording && (
          <Waveform isActive={isRecording && !isPaused} />
        )}

        {/* 录音中的控制按钮 */}
        {isRecording && (
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.controlBtn} onPress={isPaused ? resumeRecording : pauseRecording}>
              <FontAwesome name={isPaused ? 'play' : 'pause'} size={20} color={theme.colors.text} />
              <Text style={styles.controlLabel}>{isPaused ? '继续' : '暂停'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={handleRecordPress}
          disabled={isLoading}
        >
          <View style={styles.recordButtonInner}>
            <FontAwesome name={isRecording ? 'stop' : 'microphone'} size={48} color={theme.colors.text} />
          </View>
        </TouchableOpacity>

        <Text style={styles.recordInstruction}>
          {isLoading ? '上传中...' : isRecording ? (isPaused ? '已暂停' : '录音中...') : '点击开始录音'}
        </Text>
      </View>

      {/* Recent Recordings */}
      <View style={styles.recentSection}>
        <Text style={styles.sectionTitle}>最近录音</Text>
        <ScrollView>
          {recordings.length === 0 ? (
            <Text style={styles.emptyText}>暂无录音记录</Text>
          ) : (
            recordings.slice(0, 5).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.recentCard}
                onPress={() => router.push(`/recording/${item.id}`)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.cardDuration}>{formatDuration(item.duration)}</Text>
                </View>
                <View style={styles.cardFooter}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {scenes.find(s => s.type === item.scene_type)?.label || '通用'}
                    </Text>
                  </View>
                  <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  processingBadge: {
    backgroundColor: 'rgba(108, 92, 231, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.roundness.full,
  },
  processingText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  sceneSelector: {
    marginBottom: theme.spacing.lg,
  },
  sceneScroll: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  sceneChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.roundness.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  sceneChipActive: {
    backgroundColor: 'rgba(108, 92, 231, 0.2)',
    borderColor: theme.colors.primary,
  },
  sceneText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  sceneTextActive: {
    color: theme.colors.primary,
  },
  recordingHub: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    minHeight: 280,
  },
  timer: {
    fontSize: 48,
    fontWeight: '300',
    color: theme.colors.text,
    fontFamily: 'monospace',
    marginBottom: theme.spacing.lg,
  },
  controlRow: {
    flexDirection: 'row',
    gap: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 4,
  },
  controlLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  recordButtonActive: {
    backgroundColor: theme.colors.danger,
    shadowColor: theme.colors.danger,
  },
  recordButtonInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInstruction: {
    marginTop: theme.spacing.lg,
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  recentSection: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
  recentCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.roundness.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  cardDuration: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontFamily: 'monospace',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: theme.colors.surfaceHigh,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.roundness.sm,
  },
  badgeText: {
    color: theme.colors.textSecondary,
    fontSize: 10,
  },
  statusText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
});
