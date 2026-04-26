import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { theme } from '@/constants/theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useRecordingStore } from '@/stores/recordingStore';
import { api } from '@/services/api';
import { SceneType, Recording } from '@/types';
import { Audio } from 'expo-av';

export default function HistoryScreen() {
  const router = useRouter();
  const { recordings, fetchRecordings, isLoading } = useRecordingStore();
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Recording[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const voiceRecording = useRef<Audio.Recording | null>(null);

  const filters = [
    { id: 'all', label: '全部' },
    { id: 'meeting', label: '📋 会议' },
    { id: 'interview', label: '🎤 面试' },
    { id: 'idea', label: '💡 灵感' },
  ];

  useEffect(() => {
    const sceneFilter = activeFilter === 'all' ? undefined : activeFilter as SceneType;
    fetchRecordings(sceneFilter);
  }, [activeFilter]);

  // 搜索防抖
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.get('/recordings/search', { params: { q: searchQuery.trim() } });
        setSearchResults(res.data.items);
      } catch {
        // 搜索失败回退到本地过滤
        setSearchResults(
          recordings.filter(r => r.title.toLowerCase().includes(searchQuery.toLowerCase()))
        );
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  // 语音搜索处理
  const handleVoiceSearch = async () => {
    if (isVoiceRecording) {
      // 停止录音 → 识别
      try {
        setIsVoiceRecording(false);
        setIsVoiceProcessing(true);
        
        if (voiceRecording.current) {
          await voiceRecording.current.stopAndUnloadAsync();
          const uri = voiceRecording.current.getURI();
          voiceRecording.current = null;

          if (uri) {
            // 上传到后端做 ASR
            const formData = new FormData();
            formData.append('file', {
              uri,
              name: 'voice_search.m4a',
              type: 'audio/m4a',
            } as any);
            formData.append('title', 'voice_search');
            formData.append('scene_type', 'general');

            const uploadRes = await api.post('/recordings/upload', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            const recId = uploadRes.data.id;

            // 触发转写
            await api.post(`/recordings/${recId}/transcribe`);

            // 轮询等待转写完成（最多 15 秒）
            let text = '';
            for (let i = 0; i < 15; i++) {
              await new Promise(r => setTimeout(r, 1000));
              const statusRes = await api.get(`/recordings/${recId}/status`);
              if (['transcribed', 'done', 'analyzing'].includes(statusRes.data.status)) {
                const detailRes = await api.get(`/recordings/${recId}`);
                text = detailRes.data.transcript || '';
                break;
              }
              if (statusRes.data.status === 'failed') break;
            }

            // 清理临时录音
            api.delete(`/recordings/${recId}`).catch(() => {});

            if (text) {
              // 取前 20 字作为搜索词
              const searchText = text.replace(/\s+/g, '').slice(0, 20);
              setSearchQuery(searchText);
            } else {
              Alert.alert('识别失败', '未能识别语音内容，请重试');
            }
          }
        }
      } catch (e) {
        Alert.alert('语音搜索失败', '请检查麦克风权限');
      } finally {
        setIsVoiceProcessing(false);
      }
    } else {
      // 开始录音
      try {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
          Alert.alert('需要麦克风权限', '请在设置中允许麦克风访问');
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        voiceRecording.current = recording;
        setIsVoiceRecording(true);

        // 5 秒后自动停止
        setTimeout(() => {
          if (voiceRecording.current) {
            handleVoiceSearch();
          }
        }, 5000);
      } catch (e) {
        Alert.alert('录音失败', '无法启动麦克风');
      }
    }
  };

  const displayRecordings = searchResults !== null ? searchResults : recordings;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch {
      return dateStr;
    }
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

  const getStatusColor = (status: string) => {
    if (status === 'done') return theme.colors.success;
    if (status === 'failed') return theme.colors.danger;
    return theme.colors.secondary;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>录音历史</Text>
        <Text style={styles.countText}>{isSearching ? '搜索中...' : `${displayRecordings.length} 条`}</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <FontAwesome name="search" size={16} color={theme.colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索录音..."
          placeholderTextColor={theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <FontAwesome name="times-circle" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleVoiceSearch}
            disabled={isVoiceProcessing}
            style={[styles.voiceBtn, isVoiceRecording && styles.voiceBtnActive]}
          >
            {isVoiceProcessing ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <FontAwesome
                name="microphone"
                size={16}
                color={isVoiceRecording ? '#FF6B6B' : theme.colors.primary}
              />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {filters.map(filter => (
            <TouchableOpacity
              key={filter.id}
              style={[styles.filterChip, activeFilter === filter.id && styles.activeFilterChip]}
              onPress={() => setActiveFilter(filter.id)}
            >
              <Text style={[styles.filterText, activeFilter === filter.id && styles.activeFilterText]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      <ScrollView contentContainerStyle={styles.listContainer}>
        {/* Search Results Header */}
        {searchResults !== null && (
          <View style={styles.searchResultsHeader}>
            <Text style={styles.searchResultsText}>
              🔍 搜索「{searchQuery}」找到 {searchResults.length} 条结果
            </Text>
          </View>
        )}

        {displayRecordings.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome name="folder-open-o" size={48} color={theme.colors.textSecondary} />
            <Text style={styles.emptyTitle}>{isLoading ? '加载中...' : searchQuery ? '没有搜索结果' : '暂无录音记录'}</Text>
            <Text style={styles.emptySubtitle}>{searchQuery ? '换个关键词试试' : '开始录音后，记录将在这里显示'}</Text>
          </View>
        ) : (
          displayRecordings.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, searchResults !== null && styles.cardSearchResult]}
              onPress={() => router.push(`/recording/${item.id}`)}
            >
              <View style={styles.cardMain}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.metaText}>{formatDuration(item.duration)}</Text>
                  <Text style={styles.metaDivider}>•</Text>
                  <Text style={styles.metaText}>{formatDate(item.created_at)}</Text>
                </View>
                <View style={styles.cardTags}>
                  <View style={styles.sceneBadge}>
                    <Text style={styles.sceneBadgeText}>
                      {filters.find(f => f.id === item.scene_type)?.label || '通用'}
                    </Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
                    <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
                  </View>
                </View>
              </View>
              <FontAwesome name="angle-right" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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
    alignItems: 'baseline',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl + 20,
    paddingBottom: theme.spacing.md,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  countText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.roundness.full,
    height: 48,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    marginBottom: theme.spacing.md,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 16,
  },
  filterContainer: {
    marginBottom: theme.spacing.lg,
  },
  filterScroll: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.roundness.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  activeFilterChip: {
    backgroundColor: 'rgba(108, 92, 231, 0.2)',
    borderColor: theme.colors.primary,
  },
  filterText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  activeFilterText: {
    color: theme.colors.primary,
  },
  listContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    opacity: 0.7,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.roundness.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  cardMain: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  metaText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  metaDivider: {
    color: theme.colors.textSecondary,
    marginHorizontal: theme.spacing.sm,
  },
  cardTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  sceneBadge: {
    backgroundColor: theme.colors.surfaceHigh,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.roundness.sm,
  },
  sceneBadgeText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.roundness.sm,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: theme.colors.text,
    fontSize: 11,
  },
  searchResultsHeader: {
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
    padding: theme.spacing.md,
    borderRadius: theme.roundness.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  searchResultsText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  cardSearchResult: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.secondary,
  },
  voiceBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(108, 92, 231, 0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  voiceBtnActive: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
  },
});
