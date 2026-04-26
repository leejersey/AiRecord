import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { api } from '@/services/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { recording_id: string; title: string; relevance_score: number }[];
}

export default function KnowledgeScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const sendQuery = async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    const userMsg: Message = { role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await api.post('/knowledge/query', { question });
      const assistantMsg: Message = {
        role: 'assistant',
        content: res.data.answer,
        sources: res.data.sources,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '查询失败，请检查网络连接或稍后重试。',
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome name="angle-left" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📚 知识库</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Chat Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <FontAwesome name="comments" size={48} color={theme.colors.textSecondary} />
            <Text style={styles.emptyTitle}>向你的录音提问</Text>
            <Text style={styles.emptySubtitle}>基于所有录音的 AI 智能问答</Text>

            <View style={styles.suggestions}>
              {['上次会议讨论了什么？', '最近有哪些待办事项？', '面试中提到的技术栈有哪些？'].map((q, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.suggestionChip}
                  onPress={() => { setInput(q); }}
                >
                  <Text style={styles.suggestionText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {messages.map((msg, i) => (
          <View key={i} style={[styles.msgRow, msg.role === 'user' && styles.msgRowUser]}>
            <View style={[
              styles.msgBubble,
              msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}>
              <Text style={[
                styles.msgText,
                msg.role === 'user' && styles.userMsgText,
              ]}>{msg.content}</Text>
            </View>

            {/* Sources */}
            {msg.sources && msg.sources.length > 0 && (
              <View style={styles.sourcesRow}>
                <Text style={styles.sourcesLabel}>📎 来源:</Text>
                {msg.sources.map((s, j) => (
                  <TouchableOpacity
                    key={j}
                    style={styles.sourceChip}
                    onPress={() => router.push(`/recording/${s.recording_id}`)}
                  >
                    <Text style={styles.sourceText} numberOfLines={1}>{s.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ))}

        {isLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.loadingText}>思考中...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="输入你的问题..."
          placeholderTextColor={theme.colors.textSecondary}
          onSubmitEditing={sendQuery}
          returnKeyType="send"
          multiline
          editable={!isLoading}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
          onPress={sendQuery}
          disabled={!input.trim() || isLoading}
        >
          <FontAwesome name="send" size={16} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.xl + 20,
    paddingBottom: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.outline,
  },
  backBtn: { width: 40, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  chatArea: { flex: 1 },
  chatContent: { padding: theme.spacing.lg, paddingBottom: 20 },
  // Empty State
  emptyState: { alignItems: 'center', paddingTop: 60, gap: theme.spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  emptySubtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg },
  suggestions: { gap: theme.spacing.sm, width: '100%' },
  suggestionChip: {
    backgroundColor: theme.colors.surface, borderRadius: theme.roundness.lg,
    padding: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.outline,
  },
  suggestionText: { color: theme.colors.text, fontSize: 14 },
  // Messages
  msgRow: { marginBottom: theme.spacing.lg },
  msgRowUser: { alignItems: 'flex-end' },
  msgBubble: {
    maxWidth: '85%', padding: theme.spacing.md, borderRadius: theme.roundness.lg,
  },
  userBubble: {
    backgroundColor: theme.colors.primary, borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: theme.colors.surface, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: theme.colors.outline,
  },
  msgText: { color: theme.colors.text, fontSize: 15, lineHeight: 22 },
  userMsgText: { color: '#fff' },
  sourcesRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    gap: 6, marginTop: theme.spacing.sm, paddingLeft: 4,
  },
  sourcesLabel: { fontSize: 12, color: theme.colors.textSecondary },
  sourceChip: {
    backgroundColor: 'rgba(108, 92, 231, 0.12)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: theme.roundness.full,
  },
  sourceText: { color: theme.colors.primary, fontSize: 11, fontWeight: '600', maxWidth: 120 },
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  loadingText: { color: theme.colors.textSecondary, fontSize: 14 },
  // Input Bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm,
    padding: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.outline,
    backgroundColor: theme.colors.surfaceHigh,
  },
  textInput: {
    flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.roundness.lg,
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
    color: theme.colors.text, fontSize: 15, maxHeight: 100,
    borderWidth: 1, borderColor: theme.colors.outline,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
