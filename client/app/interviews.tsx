import { StyleSheet, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { api } from '@/services/api';

interface Candidate {
  recording_id: string;
  name: string;
  title: string;
  avg_score: number;
  recommendation: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  scores: Record<string, number>;
}

const DIM_LABELS: Record<string, string> = {
  technical_skill: '技术',
  communication: '沟通',
  logical_thinking: '逻辑',
  culture_fit: '文化',
};

const REC_COLORS: Record<string, string> = {
  '强烈推荐': '#00CEC9',
  '推荐': '#6C5CE7',
  '待定': '#FDCB6E',
  '不推荐': '#FF6B6B',
};

export default function InterviewsScreen() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    loadCandidates();
  }, []);

  const loadCandidates = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/interviews/candidates');
      setCandidates(res.data.candidates || []);
    } catch (e) {
      console.log('加载候选人失败', e);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleExportReport = async (recordingId: string) => {
    try {
      const url = `${api.defaults.baseURL}/interviews/report/${recordingId}`;
      // 在浏览器或 WebView 中打开
      Alert.alert('导出报告', `报告链接:\n${url}`, [{ text: '确定' }]);
    } catch {
      Alert.alert('导出失败');
    }
  };

  const renderScoreBar = (score: number, maxScore: number = 10) => {
    const pct = (score / maxScore) * 100;
    const color = score >= 8 ? '#00CEC9' : score >= 6 ? '#6C5CE7' : score >= 4 ? '#FDCB6E' : '#FF6B6B';
    return (
      <View style={styles.scoreBarTrack}>
        <View style={[styles.scoreBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    );
  };

  const getRankEmoji = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome name="angle-left" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎯 面试对比</Text>
        {candidates.length >= 2 && (
          <TouchableOpacity
            style={[styles.compareToggle, compareMode && styles.compareToggleActive]}
            onPress={() => { setCompareMode(!compareMode); setSelectedIds([]); }}
          >
            <Text style={[styles.compareToggleText, compareMode && { color: '#fff' }]}>
              {compareMode ? '取消' : '对比'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : candidates.length === 0 ? (
        <View style={[styles.container, styles.center]}>
          <FontAwesome name="user-plus" size={48} color={theme.colors.textSecondary} />
          <Text style={styles.emptyTitle}>暂无面试记录</Text>
          <Text style={styles.emptySubtitle}>选择「面试分析」场景录制面试</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {/* Compare bar */}
          {compareMode && selectedIds.length >= 2 && (
            <TouchableOpacity
              style={styles.compareBar}
              onPress={() => {
                // 跳转到对比视图（复用当前页面滚动到下方矩阵区）
                Alert.alert(
                  '对比结果',
                  `已选 ${selectedIds.length} 位候选人\n\n${
                    candidates
                      .filter(c => selectedIds.includes(c.recording_id))
                      .map((c, i) => `${getRankEmoji(i)} ${c.name}: ${c.avg_score}分 — ${c.recommendation}`)
                      .join('\n')
                  }`
                );
              }}
            >
              <Text style={styles.compareBarText}>
                📊 对比 {selectedIds.length} 位候选人
              </Text>
            </TouchableOpacity>
          )}

          {/* Candidate Cards */}
          {candidates.map((candidate, index) => (
            <TouchableOpacity
              key={candidate.recording_id}
              style={[
                styles.candidateCard,
                compareMode && selectedIds.includes(candidate.recording_id) && styles.cardSelected,
              ]}
              onPress={() => {
                if (compareMode) {
                  toggleSelect(candidate.recording_id);
                } else {
                  router.push(`/recording/${candidate.recording_id}`);
                }
              }}
              onLongPress={() => handleExportReport(candidate.recording_id)}
            >
              {/* Rank + Name */}
              <View style={styles.cardTop}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>{getRankEmoji(index)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.candidateName}>{candidate.name}</Text>
                  <Text style={styles.candidateDate}>
                    {candidate.title}
                  </Text>
                </View>
                <View style={[
                  styles.recBadge,
                  { backgroundColor: `${REC_COLORS[candidate.recommendation] || theme.colors.outline}20` },
                ]}>
                  <Text style={[
                    styles.recText,
                    { color: REC_COLORS[candidate.recommendation] || theme.colors.textSecondary },
                  ]}>
                    {candidate.recommendation}
                  </Text>
                </View>
              </View>

              {/* Score Grid */}
              <View style={styles.scoreGrid}>
                {Object.entries(DIM_LABELS).map(([key, label]) => (
                  <View key={key} style={styles.scoreItem}>
                    <View style={styles.scoreHeader}>
                      <Text style={styles.scoreLabel}>{label}</Text>
                      <Text style={styles.scoreValue}>{candidate.scores[key] || 0}</Text>
                    </View>
                    {renderScoreBar(candidate.scores[key] || 0)}
                  </View>
                ))}
              </View>

              {/* Avg Score */}
              <View style={styles.avgRow}>
                <Text style={styles.avgLabel}>综合评分</Text>
                <Text style={styles.avgScore}>{candidate.avg_score}</Text>
                <Text style={styles.avgMax}>/10</Text>
              </View>

              {/* Summary */}
              {candidate.summary && (
                <Text style={styles.summaryText} numberOfLines={2}>{candidate.summary}</Text>
              )}

              {/* Compare checkbox */}
              {compareMode && (
                <View style={styles.checkRow}>
                  <FontAwesome
                    name={selectedIds.includes(candidate.recording_id) ? 'check-square' : 'square-o'}
                    size={20}
                    color={selectedIds.includes(candidate.recording_id) ? theme.colors.primary : theme.colors.textSecondary}
                  />
                </View>
              )}
            </TouchableOpacity>
          ))}

          <Text style={styles.tipText}>💡 长按卡片可导出 HR 评估报告</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.xl + 20,
    paddingBottom: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.outline,
  },
  backBtn: { width: 40, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  compareToggle: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: theme.roundness.full,
    borderWidth: 1, borderColor: theme.colors.primary,
  },
  compareToggleActive: { backgroundColor: theme.colors.primary },
  compareToggleText: { color: theme.colors.primary, fontSize: 13, fontWeight: '600' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.colors.text },
  emptySubtitle: { fontSize: 14, color: theme.colors.textSecondary },
  listContent: { padding: theme.spacing.lg, paddingBottom: 40 },
  compareBar: {
    backgroundColor: theme.colors.primary, borderRadius: theme.roundness.lg,
    padding: theme.spacing.md, alignItems: 'center', marginBottom: theme.spacing.lg,
  },
  compareBarText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  candidateCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.roundness.lg,
    padding: theme.spacing.lg, marginBottom: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.outline,
  },
  cardSelected: { borderColor: theme.colors.primary, borderWidth: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md },
  rankBadge: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceHigh,
    alignItems: 'center', justifyContent: 'center', marginRight: theme.spacing.md,
  },
  rankText: { fontSize: 16 },
  candidateName: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
  candidateDate: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  recBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.roundness.full,
  },
  recText: { fontSize: 12, fontWeight: '600' },
  scoreGrid: { gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  scoreItem: {},
  scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  scoreLabel: { fontSize: 12, color: theme.colors.textSecondary },
  scoreValue: { fontSize: 12, color: theme.colors.text, fontWeight: '700', fontFamily: 'monospace' },
  scoreBarTrack: {
    height: 6, backgroundColor: theme.colors.surfaceHigh, borderRadius: 3, overflow: 'hidden',
  },
  scoreBarFill: { height: '100%', borderRadius: 3 },
  avgRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    paddingVertical: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.outline,
  },
  avgLabel: { fontSize: 13, color: theme.colors.textSecondary, marginRight: theme.spacing.sm },
  avgScore: { fontSize: 28, fontWeight: '800', color: theme.colors.primary },
  avgMax: { fontSize: 14, color: theme.colors.textSecondary },
  summaryText: {
    fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20, marginTop: theme.spacing.sm,
  },
  checkRow: { position: 'absolute', top: theme.spacing.lg, right: theme.spacing.lg },
  tipText: {
    textAlign: 'center', color: theme.colors.textSecondary, fontSize: 12,
    marginTop: theme.spacing.md, opacity: 0.6,
  },
});
