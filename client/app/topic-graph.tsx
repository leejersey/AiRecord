import { StyleSheet, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { api } from '@/services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface GraphNode {
  id: string;
  label: string;
  size: number;
  type: string;
  scenes: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

const SCENE_COLORS: Record<string, string> = {
  meeting: '#6C5CE7',
  interview: '#00CEC9',
  idea: '#FDCB6E',
  general: '#A29BFE',
};

export default function TopicGraphScreen() {
  const router = useRouter();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [totalTopics, setTotalTopics] = useState(0);
  const [totalRecordings, setTotalRecordings] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    loadGraph();
  }, []);

  const loadGraph = async () => {
    try {
      const res = await api.get('/knowledge/graph');
      setNodes(res.data.nodes || []);
      setEdges(res.data.edges || []);
      setTotalTopics(res.data.total_topics || 0);
      setTotalRecordings(res.data.total_recordings || 0);
    } catch (e) {
      console.log('加载图谱失败', e);
    } finally {
      setIsLoading(false);
    }
  };

  const getNodeSize = (count: number) => {
    const base = 36;
    return Math.min(base + count * 12, 90);
  };

  const getNodeColor = (node: GraphNode) => {
    if (node.scenes.length === 0) return SCENE_COLORS.general;
    return SCENE_COLORS[node.scenes[0]] || SCENE_COLORS.general;
  };

  const getConnectedNodes = (nodeId: string) => {
    const connected = new Set<string>();
    edges.forEach(e => {
      if (e.source === nodeId) connected.add(e.target);
      if (e.target === nodeId) connected.add(e.source);
    });
    return connected;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome name="angle-left" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🌐 知识图谱</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : nodes.length === 0 ? (
        <View style={[styles.container, styles.center]}>
          <FontAwesome name="sitemap" size={48} color={theme.colors.textSecondary} />
          <Text style={styles.emptyTitle}>知识图谱为空</Text>
          <Text style={styles.emptySubtitle}>分析更多录音后，话题网络将在这里呈现</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{totalTopics}</Text>
              <Text style={styles.statLabel}>话题总数</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{totalRecordings}</Text>
              <Text style={styles.statLabel}>关联录音</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{edges.length}</Text>
              <Text style={styles.statLabel}>关联关系</Text>
            </View>
          </View>

          {/* Bubble Graph */}
          <View style={styles.graphContainer}>
            <Text style={styles.sectionTitle}>💡 话题气泡图</Text>
            <Text style={styles.sectionSubtitle}>气泡越大 = 出现次数越多，点击查看详情</Text>

            <View style={styles.bubbleArea}>
              {nodes.slice(0, 20).map((node, index) => {
                const size = getNodeSize(node.size);
                const color = getNodeColor(node);
                const isSelected = selectedNode?.id === node.id;
                const connectedNodes = selectedNode ? getConnectedNodes(selectedNode.id) : new Set();
                const isConnected = selectedNode ? connectedNodes.has(node.id) : false;
                const opacity = selectedNode ? (isSelected || isConnected ? 1 : 0.3) : 1;

                // 布局计算（简单网格排列）
                const cols = 4;
                const row = Math.floor(index / cols);
                const col = index % cols;
                const cellW = (SCREEN_WIDTH - 64) / cols;
                const x = col * cellW + (cellW - size) / 2;
                const y = row * (size + 20);

                return (
                  <TouchableOpacity
                    key={node.id}
                    style={[
                      styles.bubble,
                      {
                        width: size, height: size, borderRadius: size / 2,
                        backgroundColor: `${color}30`,
                        borderColor: isSelected ? color : `${color}60`,
                        borderWidth: isSelected ? 3 : 1,
                        left: x, top: y,
                        opacity,
                      },
                    ]}
                    onPress={() => setSelectedNode(isSelected ? null : node)}
                  >
                    <Text
                      style={[styles.bubbleText, { fontSize: Math.max(10, Math.min(size / 4, 14)) }]}
                      numberOfLines={2}
                    >
                      {node.label}
                    </Text>
                    <Text style={styles.bubbleCount}>{node.size}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Selected Detail */}
          {selectedNode && (
            <View style={styles.detailCard}>
              <View style={styles.detailHeader}>
                <Text style={styles.detailTitle}>📌 {selectedNode.label}</Text>
                <TouchableOpacity onPress={() => setSelectedNode(null)}>
                  <FontAwesome name="times" size={16} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.detailMeta}>
                出现 {selectedNode.size} 次 · {selectedNode.scenes.map(s =>
                  s === 'meeting' ? '📋会议' : s === 'interview' ? '🎤面试' : s === 'idea' ? '💡灵感' : '🔹通用'
                ).join(' ')}
              </Text>

              {/* Connected topics */}
              <Text style={styles.detailSubtitle}>关联话题：</Text>
              <View style={styles.connectedList}>
                {edges
                  .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                  .sort((a, b) => b.weight - a.weight)
                  .slice(0, 8)
                  .map((edge, i) => {
                    const other = edge.source === selectedNode.id ? edge.target : edge.source;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={styles.connectedChip}
                        onPress={() => {
                          const n = nodes.find(n => n.id === other);
                          if (n) setSelectedNode(n);
                        }}
                      >
                        <Text style={styles.connectedText}>{other}</Text>
                        <Text style={styles.connectedWeight}>×{edge.weight}</Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            </View>
          )}

          {/* Topic List */}
          <View style={styles.topicList}>
            <Text style={styles.sectionTitle}>📊 话题排行</Text>
            {nodes.slice(0, 15).map((node, i) => (
              <TouchableOpacity
                key={node.id}
                style={styles.topicRow}
                onPress={() => setSelectedNode(node)}
              >
                <Text style={styles.topicRank}>#{i + 1}</Text>
                <View style={styles.topicInfo}>
                  <Text style={styles.topicName}>{node.label}</Text>
                  <View style={styles.topicBarTrack}>
                    <View
                      style={[
                        styles.topicBarFill,
                        {
                          width: `${(node.size / Math.max(nodes[0]?.size || 1, 1)) * 100}%`,
                          backgroundColor: getNodeColor(node),
                        },
                      ]}
                    />
                  </View>
                </View>
                <Text style={styles.topicCount}>{node.size}次</Text>
              </TouchableOpacity>
            ))}
          </View>
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
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.colors.text },
  emptySubtitle: { fontSize: 14, color: theme.colors.textSecondary },
  content: { padding: theme.spacing.lg, paddingBottom: 60 },
  statsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
  statCard: {
    flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.roundness.lg,
    padding: theme.spacing.md, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.outline,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: theme.colors.primary },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
  graphContainer: { marginBottom: theme.spacing.xl },
  bubbleArea: { position: 'relative', minHeight: 300, marginTop: theme.spacing.sm },
  bubble: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center', padding: 4,
  },
  bubbleText: { color: theme.colors.text, fontWeight: '600', textAlign: 'center' },
  bubbleCount: { fontSize: 10, color: theme.colors.textSecondary, fontFamily: 'monospace' },
  detailCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.roundness.lg,
    padding: theme.spacing.lg, marginBottom: theme.spacing.xl,
    borderWidth: 1, borderColor: theme.colors.primary,
  },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  detailMeta: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6, marginBottom: theme.spacing.md },
  detailSubtitle: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginBottom: theme.spacing.sm },
  connectedList: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  connectedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(108, 92, 231, 0.1)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: theme.roundness.full,
  },
  connectedText: { color: theme.colors.primary, fontSize: 12, fontWeight: '600' },
  connectedWeight: { color: theme.colors.textSecondary, fontSize: 10 },
  topicList: { marginBottom: theme.spacing.xl },
  topicRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1, borderBottomColor: theme.colors.outline,
  },
  topicRank: { width: 30, fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  topicInfo: { flex: 1, marginRight: theme.spacing.md },
  topicName: { fontSize: 14, color: theme.colors.text, fontWeight: '500', marginBottom: 4 },
  topicBarTrack: { height: 4, backgroundColor: theme.colors.surfaceHigh, borderRadius: 2 },
  topicBarFill: { height: '100%', borderRadius: 2 },
  topicCount: { fontSize: 13, color: theme.colors.textSecondary, fontFamily: 'monospace', width: 40, textAlign: 'right' },
});
