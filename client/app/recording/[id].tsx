import { StyleSheet, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { theme } from '@/constants/theme';
import { useRecordingStore } from '@/stores/recordingStore';
import * as player from '@/services/audioPlayer';
import { AVPlaybackStatus } from 'expo-av';
import { api } from '@/services/api';
import * as Linking from 'expo-linking';
import FontAwesome from '@expo/vector-icons/FontAwesome';

type Tab = 'transcript' | 'analysis' | 'todos';

export default function AnalysisReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('analysis');
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [playerPosition, setPlayerPosition] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [relatedRecordings, setRelatedRecordings] = useState<any[]>([]);

  const { currentRecording, fetchRecording, deleteRecording, triggerTranscribe, triggerAnalyze, isLoading } = useRecordingStore();

  useEffect(() => {
    if (id) {
      fetchRecording(id);
      // 加载相关录音
      api.get(`/knowledge/related/${id}?n=3`)
        .then(res => setRelatedRecordings(res.data.items || []))
        .catch(() => {});
    }
  }, [id]);

  // 离开页面时停止播放
  useEffect(() => {
    return () => { player.stopAudio(); };
  }, []);

  const recording = currentRecording;

  const handlePlayPause = useCallback(async () => {
    if (!recording) return;
    if (isPlayerPlaying) {
      await player.pauseAudio();
    } else {
      // 使用后端音频流接口
      const audioUrl = `${api.defaults.baseURL}/recordings/${recording.id}/audio`;
      await player.playAudio(audioUrl, (status: AVPlaybackStatus) => {
        if (status.isLoaded) {
          setIsPlayerPlaying(status.isPlaying);
          setPlayerPosition(status.positionMillis || 0);
          setPlayerDuration(status.durationMillis || 0);
          if (status.didJustFinish) {
            setIsPlayerPlaying(false);
            setPlayerPosition(0);
          }
        }
      });
    }
  }, [recording, isPlayerPlaying]);

  const handleDelete = () => {
    Alert.alert('删除录音', '确定要删除这条录音吗？此操作不可撤销。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        if (recording) {
          await deleteRecording(recording.id);
          router.back();
        }
      }},
    ]);
  };

  const handleRetry = async () => {
    if (!recording) return;
    if (recording.status === 'uploaded' || recording.status === 'failed') {
      await triggerTranscribe(recording.id);
    } else if (recording.status === 'transcribed') {
      await triggerAnalyze(recording.id);
    }
  };

  const handleRetranscribe = async () => {
    if (!recording) return;
    const confirmed = Platform.OS === 'web'
      ? window.confirm('将使用最新的 ASR 配置重新识别音频，当前转写和分析结果会被覆盖。确认重新转写？')
      : await new Promise<boolean>(resolve =>
          Alert.alert('重新转写', '将使用最新的 ASR 配置重新识别音频，当前转写和分析结果会被覆盖。', [
            { text: '取消', onPress: () => resolve(false), style: 'cancel' },
            { text: '确认', onPress: () => resolve(true) },
          ])
        );
    if (!confirmed) return;
    await triggerTranscribe(recording.id);
    setTimeout(() => fetchRecording(recording.id), 2000);
  };

  const handleExport = async () => {
    if (!recording) return;
    const exportUrl = `${api.defaults.baseURL}/recordings/${recording.id}/export`;
    try {
      await Linking.openURL(exportUrl);
    } catch {
      Alert.alert('导出失败', '无法打开导出链接');
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    } catch {
      return dateStr;
    }
  };

  const sceneLabels: Record<string, string> = {
    meeting: '📋 会议',
    interview: '🎤 面试',
    idea: '💡 灵感',
    general: '📎 通用',
  };

  if (isLoading || !recording) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  const analysis = recording.analysis;

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {recording.scene_type === 'meeting' ? '会议分析报告' :
           recording.scene_type === 'interview' ? '面试分析报告' : '灵感分析报告'}
        </Text>
        <View style={styles.headerActions}>
          {['done', 'transcribed', 'failed'].includes(recording.status) && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleRetranscribe}>
              <FontAwesome name="refresh" size={18} color={theme.colors.secondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionBtn} onPress={handleExport}>
            <FontAwesome name="download" size={18} color={theme.colors.secondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleDelete}>
            <FontAwesome name="trash-o" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.recordingTitle}>{recording.title}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{formatDuration(recording.duration)}</Text>
            <Text style={styles.metaDivider}>•</Text>
            <Text style={styles.metaText}>{formatDate(recording.created_at)}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{sceneLabels[recording.scene_type] || '通用'}</Text>
            </View>
          </View>

          {/* Mini Audio Player */}
          <View style={styles.playerBar}>
            <TouchableOpacity style={styles.playButton} onPress={handlePlayPause}>
              <FontAwesome name={isPlayerPlaying ? 'pause' : 'play'} size={14} color={theme.colors.text} />
            </TouchableOpacity>
            <View style={styles.timeline}>
              <View style={[styles.timelineProgress, { width: playerDuration > 0 ? `${(playerPosition / playerDuration) * 100}%` : '0%' }]} />
            </View>
            <Text style={styles.timeText}>
              {formatDuration(playerPosition / 1000)} / {formatDuration(recording.duration || playerDuration / 1000)}
            </Text>
          </View>

          {/* Status indicator + retry for non-done recordings */}
          {recording.status !== 'done' && (
            <TouchableOpacity style={styles.statusBar} onPress={handleRetry}>
              {recording.status === 'failed' ? (
                <FontAwesome name="refresh" size={14} color={theme.colors.danger} />
              ) : recording.status === 'transcribed' || recording.status === 'uploaded' ? (
                <FontAwesome name="hand-pointer-o" size={14} color={theme.colors.secondary} />
              ) : (
                <ActivityIndicator size="small" color={theme.colors.secondary} />
              )}
              <Text style={[styles.statusBarText, recording.status === 'failed' && { color: theme.colors.danger }]}>
                {recording.status === 'transcribing' ? '转写中...' :
                 recording.status === 'analyzing' ? 'AI 分析中...' :
                 recording.status === 'failed' ? '处理失败，点击重试' :
                 recording.status === 'uploaded' ? '点击开始处理' :
                 recording.status === 'transcribed' ? '✅ 转写完成，点击进行 AI 分析' : recording.status}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'transcript' && styles.activeTab]}
            onPress={() => setActiveTab('transcript')}
          >
            <Text style={[styles.tabText, activeTab === 'transcript' && styles.activeTabText]}>📝 转录文本</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'analysis' && styles.activeTab]}
            onPress={() => setActiveTab('analysis')}
          >
            <Text style={[styles.tabText, activeTab === 'analysis' && styles.activeTabText]}>🤖 AI 分析</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'todos' && styles.activeTab]}
            onPress={() => setActiveTab('todos')}
          >
            <Text style={[styles.tabText, activeTab === 'todos' && styles.activeTabText]}>✅ 待办事项</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'transcript' && (
            <View style={styles.transcriptSection}>
              {recording.transcript ? (
                <>
                  {recording.utterances && recording.utterances.length > 0 ? (
                    recording.utterances.map((u, i) => (
                      <View key={i} style={styles.utteranceRow}>
                        <Text style={styles.utteranceTime}>
                          [{formatDuration(u.start_time)}]
                        </Text>
                        <Text style={styles.utteranceText}>{u.text}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.transcriptText}>{recording.transcript}</Text>
                  )}
                </>
              ) : (
                <View style={styles.emptySection}>
                  <FontAwesome name="file-text-o" size={36} color={theme.colors.textSecondary} />
                  <Text style={styles.emptyText}>转录文本尚未生成</Text>
                </View>
              )}
            </View>
          )}

          {activeTab === 'analysis' && (
            <>
            <View style={styles.analysisSection}>
              {analysis ? (
                <>
                  {/* Summary */}
                  {analysis.summary && (
                    <View style={styles.summaryBox}>
                      <Text style={styles.summaryText}>{analysis.summary}</Text>
                    </View>
                  )}

                  {/* Key Points */}
                  {analysis.key_points && analysis.key_points.length > 0 && (
                    <>
                      <Text style={styles.sectionTitle}>关键要点</Text>
                      <View style={styles.bulletList}>
                        {analysis.key_points.map((point, i) => (
                          <View key={i} style={styles.bulletItem}>
                            <FontAwesome name="check-circle" size={16} color={theme.colors.secondary} style={styles.bulletIcon} />
                            <Text style={styles.bulletText}>{point}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Sentiment */}
                  {analysis.sentiment && (
                    <>
                      <Text style={styles.sectionTitle}>情感倾向</Text>
                      <View style={styles.sentimentBox}>
                        <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
                        <Text style={styles.sentimentText}>{analysis.sentiment}</Text>
                      </View>
                    </>
                  )}

                  {/* Topics */}
                  {analysis.topics && analysis.topics.length > 0 && (
                    <>
                      <Text style={styles.sectionTitle}>讨论话题</Text>
                      <View style={styles.topicCloud}>
                        {analysis.topics.map((topic, i) => (
                          <View key={i} style={styles.topicBadge}>
                            <Text style={styles.topicText}>{topic}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Follow-up Questions */}
                  {analysis.follow_up_questions && analysis.follow_up_questions.length > 0 && (
                    <>
                      <Text style={styles.sectionTitle}>待跟进</Text>
                      <View style={styles.bulletList}>
                        {analysis.follow_up_questions.map((q, i) => (
                          <View key={i} style={styles.bulletItem}>
                            <FontAwesome name="question-circle" size={16} color={theme.colors.warning} style={styles.bulletIcon} />
                            <Text style={styles.bulletText}>{q}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Highlights / 重要时刻 */}
                  {analysis.highlights && analysis.highlights.length > 0 && (
                    <>
                      <Text style={styles.sectionTitle}>⭐ 重要时刻</Text>
                      <View style={styles.bulletList}>
                        {analysis.highlights.map((h: any, i: number) => (
                          <TouchableOpacity
                            key={i}
                            style={styles.highlightItem}
                            onPress={() => {
                              // 在转录文本中搜索关键词并定位
                              if (h.keyword && recording?.utterances) {
                                const match = recording.utterances.find(
                                  u => u.text.includes(h.keyword)
                                );
                                if (match) {
                                  // 跳转到对应时间点播放
                                  const audioUrl = `${api.defaults.baseURL}/recordings/${recording.id}/audio`;
                                  player.playAudioFromPosition(audioUrl, match.start_time * 1000, (status: AVPlaybackStatus) => {
                                    if (status.isLoaded) {
                                      setIsPlayerPlaying(status.isPlaying);
                                      setPlayerPosition(status.positionMillis || 0);
                                      setPlayerDuration(status.durationMillis || 0);
                                    }
                                  });
                                }
                              }
                            }}
                          >
                            <FontAwesome name="star" size={14} color="#FDCB6E" style={styles.bulletIcon} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.bulletText}>{h.label}</Text>
                              {h.keyword && (
                                <Text style={styles.highlightKeyword}>🔍 "{h.keyword}"</Text>
                              )}
                            </View>
                            <FontAwesome name="play-circle" size={16} color={theme.colors.primary} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                </>
              ) : (
                <View style={styles.emptySection}>
                  <FontAwesome name="magic" size={36} color={theme.colors.textSecondary} />
                  <Text style={styles.emptyText}>AI 分析尚未完成</Text>
                </View>
              )}
            </View>

            {/* 相关录音推荐 */}
            {relatedRecordings.length > 0 && (
              <View style={styles.relatedSection}>
                <Text style={styles.sectionTitle}>🔗 相关录音</Text>
                {relatedRecordings.map((item, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.relatedCard}
                    onPress={() => router.push(`/recording/${item.recording_id}`)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.relatedTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.relatedMeta}>
                        相关度 {Math.round(item.relevance_score * 100)}%
                      </Text>
                    </View>
                    <FontAwesome name="angle-right" size={16} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            </>
          )}

          {activeTab === 'todos' && (
            <View style={styles.todosSection}>
              {analysis?.action_items && analysis.action_items.length > 0 ? (
                analysis.action_items.map((item, i) => (
                  <View key={i} style={styles.todoItem}>
                    <View style={styles.todoCheckbox} />
                    <View style={styles.todoInfo}>
                      <Text style={styles.todoTask}>{item.task}</Text>
                      <Text style={styles.todoMeta}>
                        {item.assignee ? `负责人: ${item.assignee}` : ''}
                        {item.assignee && item.deadline ? ' • ' : ''}
                        {item.deadline ? `截止: ${item.deadline}` : ''}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptySection}>
                  <FontAwesome name="check-square-o" size={36} color={theme.colors.textSecondary} />
                  <Text style={styles.emptyText}>暂无待办事项</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl + 20,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  backButton: { padding: theme.spacing.sm },
  headerTitle: {
    fontSize: 18, fontWeight: 'bold', color: theme.colors.text, flex: 1, textAlign: 'center',
  },
  headerActions: { flexDirection: 'row', gap: theme.spacing.md },
  actionBtn: { padding: theme.spacing.sm },
  scrollContent: { padding: theme.spacing.lg, paddingBottom: 60 },
  // Player
  playerBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surfaceHigh, padding: theme.spacing.sm,
    borderRadius: theme.roundness.full, marginTop: theme.spacing.md,
  },
  playButton: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: theme.colors.primary, alignItems: 'center',
    justifyContent: 'center', paddingLeft: 2,
  },
  timeline: {
    flex: 1, height: 4, backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md, borderRadius: 2, overflow: 'hidden',
  },
  timelineProgress: { height: '100%', backgroundColor: theme.colors.secondary, borderRadius: 2 },
  timeText: { color: theme.colors.textSecondary, fontSize: 12, fontFamily: 'monospace', minWidth: 85 },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.roundness.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    borderWidth: 1, borderColor: theme.colors.outline,
  },
  recordingTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginBottom: theme.spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.sm },
  metaText: { color: theme.colors.textSecondary, fontSize: 14 },
  metaDivider: { color: theme.colors.textSecondary, marginHorizontal: theme.spacing.sm },
  badge: {
    backgroundColor: 'rgba(108,92,231,0.2)', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: theme.roundness.sm, marginLeft: theme.spacing.md,
  },
  badgeText: { color: theme.colors.primary, fontSize: 12, fontWeight: '600' },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceHigh, padding: theme.spacing.sm,
    borderRadius: theme.roundness.md, marginTop: theme.spacing.sm,
  },
  statusBarText: { color: theme.colors.secondary, fontSize: 13 },
  tabsContainer: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.outline,
    marginBottom: theme.spacing.lg,
  },
  tab: { flex: 1, paddingVertical: theme.spacing.md, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: theme.colors.primary },
  tabText: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: '600' },
  activeTabText: { color: theme.colors.primary },
  tabContent: { flex: 1 },
  // Transcript
  transcriptSection: {},
  utteranceRow: { flexDirection: 'row', marginBottom: theme.spacing.md },
  utteranceTime: {
    color: theme.colors.secondary, fontSize: 12, fontFamily: 'monospace',
    width: 55, marginRight: theme.spacing.sm, marginTop: 2,
  },
  utteranceText: { color: theme.colors.text, fontSize: 15, lineHeight: 24, flex: 1 },
  transcriptText: { color: theme.colors.text, fontSize: 15, lineHeight: 24 },
  // Analysis
  analysisSection: {},
  summaryBox: {
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
    borderLeftWidth: 4, borderLeftColor: theme.colors.primary,
    padding: theme.spacing.lg, borderRadius: theme.roundness.lg, marginBottom: theme.spacing.xl,
    borderWidth: 1, borderColor: 'rgba(108, 92, 231, 0.15)',
  },
  summaryText: { color: theme.colors.text, fontSize: 16, lineHeight: 26, fontWeight: '500' },
  sectionTitle: {
    fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.md,
    letterSpacing: 0.3,
  },
  bulletList: { marginBottom: theme.spacing.xl, gap: theme.spacing.sm },
  bulletItem: {
    flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm, borderRadius: theme.roundness.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  bulletIcon: { marginTop: 3, marginRight: theme.spacing.md },
  bulletText: { color: theme.colors.text, fontSize: 15, flex: 1, lineHeight: 22 },
  sentimentBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0, 206, 201, 0.08)',
    padding: theme.spacing.lg, borderRadius: theme.roundness.lg, marginBottom: theme.spacing.xl,
    borderWidth: 1, borderColor: 'rgba(0, 206, 201, 0.2)',
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: theme.spacing.md },
  sentimentText: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  topicCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
  topicBadge: {
    backgroundColor: 'rgba(108, 92, 231, 0.12)', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: theme.roundness.full, borderWidth: 1, borderColor: 'rgba(108, 92, 231, 0.2)',
  },
  topicText: { color: theme.colors.primary, fontSize: 13, fontWeight: '600' },
  // Todos
  todosSection: {},
  todoItem: {
    flexDirection: 'row', backgroundColor: theme.colors.surface, padding: theme.spacing.md,
    borderRadius: theme.roundness.md, marginBottom: theme.spacing.sm,
    borderWidth: 1, borderColor: theme.colors.outline,
  },
  todoCheckbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 2,
    borderColor: theme.colors.textSecondary, marginRight: theme.spacing.md, marginTop: 2,
  },
  todoInfo: { flex: 1 },
  todoTask: { color: theme.colors.text, fontSize: 15, marginBottom: 4 },
  todoMeta: { color: theme.colors.textSecondary, fontSize: 12 },
  // Empty
  emptySection: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: theme.spacing.md },
  emptyText: { color: theme.colors.textSecondary, fontSize: 16 },
  // Highlights
  highlightItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md,
    marginBottom: 6, borderRadius: theme.roundness.md,
    backgroundColor: 'rgba(253, 203, 110, 0.08)',
    borderWidth: 1, borderColor: 'rgba(253, 203, 110, 0.2)',
  },
  highlightKeyword: {
    fontSize: 12, color: theme.colors.textSecondary, marginTop: 2, fontStyle: 'italic',
  },
  // Related
  relatedSection: { marginTop: theme.spacing.xl },
  relatedCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface,
    padding: theme.spacing.md, borderRadius: theme.roundness.md, marginBottom: theme.spacing.sm,
    borderWidth: 1, borderColor: theme.colors.outline,
  },
  relatedTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  relatedMeta: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 2 },
});
