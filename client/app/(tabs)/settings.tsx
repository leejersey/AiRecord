import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { useState, useEffect } from 'react';
import { theme } from '@/constants/theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { api, getBaseUrl } from '@/services/api';
import axios from 'axios';
import { useRouter } from 'expo-router';

interface DashboardData {
  total_recordings: number;
  total_duration_formatted: string;
  analysis_completion_rate: number;
  scene_distribution: Record<string, number>;
  todo_stats: Record<string, number>;
  weekly_activity: { day: string; count: number }[];
}

export default function SettingsScreen() {
  const router = useRouter();
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await api.get('/stats/dashboard');
      setDashboard(res.data);
    } catch (e) {
      console.log('仪表盘加载失败', e);
    }
  };

  const sceneLabels: Record<string, { label: string; color: string }> = {
    meeting: { label: '会议', color: '#6C5CE7' },
    interview: { label: '面试', color: '#00CEC9' },
    idea: { label: '灵感', color: '#FDCB6E' },
    general: { label: '通用', color: '#636e72' },
  };

  const todoTotal = dashboard
    ? (dashboard.todo_stats.pending || 0) + (dashboard.todo_stats.done || 0) + (dashboard.todo_stats.overdue || 0)
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>设置</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Dashboard Stats */}
        {dashboard && (
          <View style={styles.dashboardSection}>
            <Text style={styles.dashLabel}>数据概览</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <FontAwesome name="microphone" size={20} color={theme.colors.primary} />
                <Text style={styles.statValue}>{dashboard.total_recordings}</Text>
                <Text style={styles.statLabel}>录音总数</Text>
              </View>
              <View style={styles.statCard}>
                <FontAwesome name="clock-o" size={20} color={theme.colors.secondary} />
                <Text style={styles.statValue}>{dashboard.total_duration_formatted || '0秒'}</Text>
                <Text style={styles.statLabel}>总时长</Text>
              </View>
              <View style={styles.statCard}>
                <FontAwesome name="check-circle" size={20} color={theme.colors.success} />
                <Text style={styles.statValue}>{dashboard.analysis_completion_rate}%</Text>
                <Text style={styles.statLabel}>分析率</Text>
              </View>
              <View style={styles.statCard}>
                <FontAwesome name="list-alt" size={20} color="#FDCB6E" />
                <Text style={styles.statValue}>{todoTotal}</Text>
                <Text style={styles.statLabel}>待办总数</Text>
              </View>
            </View>

            {/* Scene Distribution */}
            {Object.keys(dashboard.scene_distribution).length > 0 && (
              <View style={styles.distributionCard}>
                <Text style={styles.distributionTitle}>场景分布</Text>
                <View style={styles.barChart}>
                  {Object.entries(dashboard.scene_distribution).map(([scene, count]) => {
                    const total = Object.values(dashboard.scene_distribution).reduce((a, b) => a + b, 0);
                    const pct = Math.round((count / Math.max(total, 1)) * 100);
                    const info = sceneLabels[scene] || { label: scene, color: '#636e72' };
                    return (
                      <View key={scene} style={styles.barRow}>
                        <Text style={styles.barLabel}>{info.label}</Text>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: info.color }]} />
                        </View>
                        <Text style={styles.barValue}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Weekly Activity */}
            {dashboard.weekly_activity.length > 0 && (
              <View style={styles.distributionCard}>
                <Text style={styles.distributionTitle}>本周活动</Text>
                <View style={styles.activityRow}>
                  {dashboard.weekly_activity.map((item, i) => {
                    const maxCount = Math.max(...dashboard.weekly_activity.map(a => a.count), 1);
                    const height = Math.max(8, (item.count / maxCount) * 40);
                    return (
                      <View key={i} style={styles.activityCol}>
                        <View style={[styles.activityBar, { height, backgroundColor: theme.colors.primary }]} />
                        <Text style={styles.activityDay}>{item.day.slice(-5)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Settings */}
        <Text style={styles.sectionLabel}>录音设置</Text>
        <View style={styles.sectionCard}>
          <View style={styles.settingItem}>
            <View style={styles.itemLeft}>
              <View style={styles.iconWrapper}>
                <FontAwesome name="microphone" size={14} color={theme.colors.secondary} />
              </View>
              <Text style={styles.itemText}>录音后自动转写</Text>
            </View>
            <Switch value={autoTranscribe} onValueChange={setAutoTranscribe}
              trackColor={{ false: theme.colors.outline, true: theme.colors.primary }}
              thumbColor={theme.colors.text} />
          </View>
          <View style={[styles.settingItem, styles.noBorder]}>
            <View style={styles.itemLeft}>
              <View style={styles.iconWrapper}>
                <FontAwesome name="magic" size={14} color={theme.colors.secondary} />
              </View>
              <Text style={styles.itemText}>转写后自动分析</Text>
            </View>
            <Switch value={autoAnalyze} onValueChange={setAutoAnalyze}
              trackColor={{ false: theme.colors.outline, true: theme.colors.primary }}
              thumbColor={theme.colors.text} />
          </View>
        </View>

        {/* 知识库入口 */}
        <Text style={styles.sectionLabel}>智能功能</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/knowledge')}>
            <View style={styles.itemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(108, 92, 231, 0.15)' }]}>
                <FontAwesome name="book" size={14} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={styles.itemText}>知识库查询</Text>
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }}>向你的录音历史提问</Text>
              </View>
            </View>
            <FontAwesome name="angle-right" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/interviews')}>
            <View style={styles.itemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(0, 206, 201, 0.15)' }]}>
                <FontAwesome name="users" size={14} color={theme.colors.secondary} />
              </View>
              <View>
                <Text style={styles.itemText}>面试对比</Text>
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }}>候选人多维度对比矩阵</Text>
              </View>
            </View>
            <FontAwesome name="angle-right" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.settingItem, styles.noBorder]} onPress={() => router.push('/topic-graph')}>
            <View style={styles.itemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(253, 203, 110, 0.15)' }]}>
                <FontAwesome name="sitemap" size={14} color="#FDCB6E" />
              </View>
              <View>
                <Text style={styles.itemText}>知识图谱</Text>
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }}>话题/人物关系网络</Text>
              </View>
            </View>
            <FontAwesome name="angle-right" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>服务状态</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity style={styles.settingItem} onPress={async () => {
            try {
              const res = await axios.get(getBaseUrl() + '/health');
              Alert.alert('连接正常', `版本: ${res.data.version}`);
            } catch { Alert.alert('连接失败', '无法连接后端'); }
          }}>
            <View style={styles.itemLeft}>
              <View style={styles.iconWrapper}>
                <FontAwesome name="server" size={14} color={theme.colors.secondary} />
              </View>
              <Text style={styles.itemText}>后端连接</Text>
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
              <FontAwesome name="angle-right" size={16} color={theme.colors.textSecondary} />
            </View>
          </TouchableOpacity>
          <View style={[styles.settingItem, styles.noBorder]}>
            <View style={styles.itemLeft}>
              <View style={styles.iconWrapper}>
                <FontAwesome name="info-circle" size={14} color={theme.colors.secondary} />
              </View>
              <Text style={styles.itemText}>版本</Text>
            </View>
            <Text style={styles.detailText}>0.2.0 (MVP)</Text>
          </View>
        </View>

        <Text style={styles.footer}>Made with ❤️ by Lizexi</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl + 20,
    paddingBottom: theme.spacing.md,
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: theme.colors.text },
  scrollContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: 60 },
  // Dashboard
  dashboardSection: { marginBottom: theme.spacing.xl },
  dashLabel: {
    fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: theme.spacing.md,
  },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  statCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: theme.colors.surface, borderRadius: theme.roundness.lg,
    padding: theme.spacing.md, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: theme.colors.outline,
  },
  statValue: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text },
  statLabel: { fontSize: 11, color: theme.colors.textSecondary },
  distributionCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.roundness.lg,
    padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.outline,
    marginBottom: theme.spacing.md,
  },
  distributionTitle: {
    fontSize: 14, fontWeight: '600', color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  barChart: { gap: theme.spacing.sm },
  barRow: { flexDirection: 'row', alignItems: 'center' },
  barLabel: { width: 36, fontSize: 12, color: theme.colors.textSecondary },
  barTrack: {
    flex: 1, height: 8, backgroundColor: theme.colors.surfaceHigh,
    borderRadius: 4, marginHorizontal: theme.spacing.sm, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  barValue: { width: 24, fontSize: 12, color: theme.colors.text, textAlign: 'right' },
  activityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  activityCol: { alignItems: 'center', gap: 4, flex: 1 },
  activityBar: { width: 12, borderRadius: 4 },
  activityDay: { fontSize: 9, color: theme.colors.textSecondary },
  // Settings
  sectionLabel: {
    fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: theme.spacing.sm, marginTop: theme.spacing.md,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.roundness.lg,
    borderWidth: 1, borderColor: theme.colors.outline, overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.outline,
  },
  noBorder: { borderBottomWidth: 0 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconWrapper: {
    width: 28, height: 28, borderRadius: 6, backgroundColor: theme.colors.surfaceHigh,
    alignItems: 'center', justifyContent: 'center', marginRight: theme.spacing.md,
  },
  itemText: { fontSize: 15, color: theme.colors.text },
  detailText: { fontSize: 14, color: theme.colors.textSecondary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  footer: {
    textAlign: 'center', color: theme.colors.textSecondary,
    fontSize: 12, marginTop: theme.spacing.xl, opacity: 0.6,
  },
});
