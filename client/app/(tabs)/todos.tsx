import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { theme } from '@/constants/theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { api } from '@/services/api';
import { Todo, TodoStatus } from '@/types';

type FilterType = 'all' | 'pending' | 'done' | 'overdue';

export default function TodosScreen() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>('pending');
  const [isLoading, setIsLoading] = useState(false);

  const filters: { id: FilterType; label: string; icon: string }[] = [
    { id: 'all', label: '全部', icon: 'list' },
    { id: 'pending', label: '待完成', icon: 'clock-o' },
    { id: 'done', label: '已完成', icon: 'check' },
    { id: 'overdue', label: '已逾期', icon: 'exclamation-triangle' },
  ];

  const fetchTodos = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (activeFilter !== 'all') params.status = activeFilter;
      const res = await api.get('/todos', { params });
      setTodos(res.data.items);
    } catch (e) {
      console.error('获取待办失败', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTodos();
  }, [activeFilter]);

  const toggleTodo = async (todo: Todo) => {
    const newStatus: TodoStatus = todo.status === 'done' ? 'pending' : 'done';
    try {
      await api.patch(`/todos/${todo.id}`, { status: newStatus });
      fetchTodos(); // 刷新列表
    } catch {
      Alert.alert('操作失败', '无法更新待办状态');
    }
  };

  const deleteTodo = (todo: Todo) => {
    Alert.alert('删除待办', `确定删除「${todo.task}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/todos/${todo.id}`);
          fetchTodos();
        } catch {
          Alert.alert('删除失败');
        }
      }},
    ]);
  };

  const getStatusColor = (status: string) => {
    if (status === 'done') return theme.colors.success;
    if (status === 'overdue') return theme.colors.danger;
    return theme.colors.secondary;
  };

  const getStatusIcon = (status: string): React.ComponentProps<typeof FontAwesome>['name'] => {
    if (status === 'done') return 'check-circle';
    if (status === 'overdue') return 'exclamation-circle';
    return 'circle-o';
  };

  const sceneLabels: Record<string, string> = {
    meeting: '📋 会议',
    interview: '🎤 面试',
    idea: '💡 灵感',
  };

  const pendingCount = todos.filter(t => t.status === 'pending').length;
  const overdueCount = todos.filter(t => t.status === 'overdue').length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>待办事项</Text>
        <View style={styles.headerStats}>
          {pendingCount > 0 && (
            <View style={styles.statBadge}>
              <Text style={styles.statText}>{pendingCount} 进行中</Text>
            </View>
          )}
          {overdueCount > 0 && (
            <View style={[styles.statBadge, styles.overdueBadge]}>
              <Text style={[styles.statText, styles.overdueText]}>{overdueCount} 逾期</Text>
            </View>
          )}
        </View>
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
              <FontAwesome
                name={filter.icon as any}
                size={12}
                color={activeFilter === filter.id ? theme.colors.primary : theme.colors.textSecondary}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.filterText, activeFilter === filter.id && styles.activeFilterText]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Todo List */}
      <ScrollView contentContainerStyle={styles.listContainer}>
        {isLoading ? (
          <Text style={styles.loadingText}>加载中...</Text>
        ) : todos.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome name="check-square-o" size={48} color={theme.colors.textSecondary} />
            <Text style={styles.emptyTitle}>
              {activeFilter === 'pending' ? '没有待完成事项 🎉' :
               activeFilter === 'overdue' ? '没有逾期事项 ✅' :
               activeFilter === 'done' ? '还没有完成过事项' : '暂无待办'}
            </Text>
            <Text style={styles.emptySubtitle}>录音分析后，AI 会自动提取待办事项</Text>
          </View>
        ) : (
          todos.map(todo => (
            <TouchableOpacity
              key={todo.id}
              style={styles.todoCard}
              onPress={() => toggleTodo(todo)}
              onLongPress={() => deleteTodo(todo)}
            >
              <FontAwesome
                name={getStatusIcon(todo.status)}
                size={22}
                color={getStatusColor(todo.status)}
                style={styles.todoIcon}
              />
              <View style={styles.todoContent}>
                <Text style={[
                  styles.todoTask,
                  todo.status === 'done' && styles.todoTaskDone,
                ]}>
                  {todo.task}
                </Text>
                <View style={styles.todoMetaRow}>
                  {todo.source_scene && (
                    <Text style={styles.todoScene}>{sceneLabels[todo.source_scene] || todo.source_scene}</Text>
                  )}
                  {todo.assignee && (
                    <View style={styles.metaChip}>
                      <FontAwesome name="user" size={10} color={theme.colors.textSecondary} />
                      <Text style={styles.metaText}>{todo.assignee}</Text>
                    </View>
                  )}
                  {todo.deadline && (
                    <View style={[styles.metaChip, todo.status === 'overdue' && styles.overdueChip]}>
                      <FontAwesome name="calendar" size={10} color={todo.status === 'overdue' ? theme.colors.danger : theme.colors.textSecondary} />
                      <Text style={[styles.metaText, todo.status === 'overdue' && styles.overdueMetaText]}>{todo.deadline}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
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
  headerStats: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  statBadge: {
    backgroundColor: 'rgba(0, 206, 201, 0.15)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: theme.roundness.full,
  },
  statText: { color: theme.colors.secondary, fontSize: 12, fontWeight: '600' },
  overdueBadge: { backgroundColor: 'rgba(255, 71, 87, 0.15)' },
  overdueText: { color: theme.colors.danger },
  filterContainer: { marginBottom: theme.spacing.md },
  filterScroll: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: theme.roundness.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.outline,
  },
  activeFilterChip: {
    backgroundColor: 'rgba(108, 92, 231, 0.2)',
    borderColor: theme.colors.primary,
  },
  filterText: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  activeFilterText: { color: theme.colors.primary },
  listContainer: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  loadingText: { color: theme.colors.textSecondary, textAlign: 'center', marginTop: 60 },
  emptyState: {
    alignItems: 'center', justifyContent: 'center',
    paddingTop: 80, gap: theme.spacing.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.colors.textSecondary },
  emptySubtitle: { fontSize: 14, color: theme.colors.textSecondary, opacity: 0.7 },
  todoCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.roundness.lg,
    marginBottom: theme.spacing.sm,
    borderWidth: 1, borderColor: theme.colors.outline,
  },
  todoIcon: { marginTop: 2, marginRight: theme.spacing.md },
  todoContent: { flex: 1 },
  todoTask: { fontSize: 15, color: theme.colors.text, lineHeight: 22, marginBottom: 6 },
  todoTaskDone: {
    textDecorationLine: 'line-through',
    color: theme.colors.textSecondary,
    opacity: 0.7,
  },
  todoMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  todoScene: { fontSize: 11, color: theme.colors.textSecondary },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.surfaceHigh,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: theme.roundness.sm,
  },
  overdueChip: { backgroundColor: 'rgba(255, 71, 87, 0.1)' },
  metaText: { fontSize: 11, color: theme.colors.textSecondary },
  overdueMetaText: { color: theme.colors.danger },
});
